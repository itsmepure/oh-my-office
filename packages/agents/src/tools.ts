// @repo/agents/tools — sandboxed file operations with path guard.
//
// Non-Negotiable Rule #4: "Every file/code tool call goes through the path
// guard. Any path escape is rejected."
//
// The guard resolves the requested path relative to the office's workspace
// and verifies the resolved path stays within that root. Use `resolve()` +
// prefix check rather than string-matching to defeat `../../etc/passwd`.

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

// ── Workspace quota (Phase L4 — abuse / cost control) ────────────────────────

/** Max bytes for a single file write. Default 5 MB; override via env. */
export const MAX_FILE_BYTES = Number(process.env['WORKSPACE_MAX_FILE_BYTES'] ?? 5 * 1024 * 1024);
/** Max total bytes across the whole office workspace. Default 50 MB. */
export const MAX_WORKSPACE_BYTES = Number(process.env['WORKSPACE_MAX_TOTAL_BYTES'] ?? 50 * 1024 * 1024);

export class QuotaExceededError extends Error {
  override name = 'QuotaExceededError';
  constructor(message: string) {
    super(message);
  }
}

/** Sum the byte size of every file under `dir` (recursive). Missing dir → 0. */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import('node:fs').Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as unknown as import('node:fs').Dirent[];
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const abs = resolve(dir, String(entry.name));
    if (entry.isDirectory()) {
      total += await dirSize(abs);
    } else if (entry.isFile()) {
      try {
        total += (await stat(abs)).size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

// ── Path Guard ─────────────────────────────────────────────────────────────

export class PathEscapeError extends Error {
  override name = 'PathEscapeError';
  constructor(public readonly requestedPath: string) {
    super(`Path escape rejected: ${requestedPath}`);
  }
}

/**
 * Validate that `requestedPath` stays inside `workspaceRoot`. Normalises
 * the path (resolves `.` and `..` segments), then checks that the result
 * still begins with the workspace root (plus a trailing separator to block
 * sibling-prefix attacks). Throws `PathEscapeError` on escape.
 *
 * Returns the safe, absolute path inside the workspace.
 */
export function guardPath(workspaceRoot: string, requestedPath: string): string {
  // Flatten to absolute, removing `..` segments.
  const safe = resolve(workspaceRoot, requestedPath);

  // Must still be inside workspaceRoot. Append the platform separator to
  // prevent sibling attacks (e.g. workspace="/foo/bar" and path="../baz").
  const root = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
  if (!safe.startsWith(root) && safe !== workspaceRoot) {
    throw new PathEscapeError(requestedPath);
  }

  return safe;
}

// ── Tool implementations ───────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  output: string;
  /** Optional structured data (e.g. file listing). */
  data?: unknown;
}

/**
 * Read a file inside the workspace. Path must be relative or absolute within
 * the workspace root.
 */
export async function safeReadFile(
  workspaceRoot: string,
  requestedPath: string,
): Promise<ToolResult> {
  try {
    const safe = guardPath(workspaceRoot, requestedPath);
    const content = await readFile(safe, 'utf-8');
    return { success: true, output: content };
  } catch (err) {
    if (err instanceof PathEscapeError) throw err;
    return { success: false, output: `Failed to read file: ${(err as Error).message}` };
  }
}

/**
 * Write a file inside the workspace. Creates parent directories if needed.
 * Path must be relative or absolute within the workspace root.
 */
export async function safeWriteFile(
  workspaceRoot: string,
  requestedPath: string,
  content: string,
): Promise<ToolResult> {
  try {
    const safe = guardPath(workspaceRoot, requestedPath);
    const writeBytes = Buffer.byteLength(content, 'utf-8');

    // Quota: single-file cap.
    if (writeBytes > MAX_FILE_BYTES) {
      return {
        success: false,
        output: `File too large: ${writeBytes} bytes exceeds the ${MAX_FILE_BYTES}-byte per-file limit.`,
      };
    }
    // Quota: total-workspace cap (account for replacing an existing file).
    let existing = 0;
    try {
      existing = (await stat(safe)).size;
    } catch {
      /* new file */
    }
    const projected = (await dirSize(workspaceRoot)) - existing + writeBytes;
    if (projected > MAX_WORKSPACE_BYTES) {
      return {
        success: false,
        output: `Workspace quota exceeded: this write would bring the workspace to ${projected} bytes, over the ${MAX_WORKSPACE_BYTES}-byte limit.`,
      };
    }

    await mkdir(resolve(safe, '..'), { recursive: true });
    await writeFile(safe, content, 'utf-8');
    return { success: true, output: `Wrote ${writeBytes} bytes to ${relative(workspaceRoot, safe)}` };
  } catch (err) {
    if (err instanceof PathEscapeError) throw err;
    return { success: false, output: `Failed to write file: ${(err as Error).message}` };
  }
}

/**
 * List files in a directory inside the workspace. Returns filenames and
 * whether each is a file or directory.
 */
export async function safeListFiles(
  workspaceRoot: string,
  requestedPath: string,
): Promise<ToolResult> {
  try {
    const safe = guardPath(workspaceRoot, requestedPath);
    const entries = await readdir(safe, { withFileTypes: true });
    const listing = entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
    }));
    return {
      success: true,
      output: listing.map((e) => `${e.type === 'directory' ? 'd' : '-'} ${e.name}`).join('\n'),
      data: listing,
    };
  } catch (err) {
    if (err instanceof PathEscapeError) throw err;
    return { success: false, output: `Failed to list files: ${(err as Error).message}` };
  }
}

// ── Tool registry ──────────────────────────────────────────────────────────

/**
 * Maps tool names (as seen by the LLM) to their implementations. Every entry
 * carries a `definition` (for the Provider) and an `execute` function that
 * receives the tool arguments + the workspace root.
 */
export interface RegisteredTool {
  definition: ToolDef;
  execute(args: Record<string, unknown>, workspaceRoot: string): Promise<ToolResult>;
}

/** Lightweight re-export from provider so tools.ts doesn't need to import it. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function toDef(name: string, desc: string, props: Record<string, unknown>): ToolDef {
  return {
    name,
    description: desc,
    parameters: {
      type: 'object',
      properties: props,
      required: Object.keys(props),
    },
  };
}

/** Creates the MVP tool set bound to a workspace root. */
export function createToolRegistry(_workspaceRoot: string): Record<string, RegisteredTool> {
  // workspaceRoot is captured per-office; the tool execute() closures use it.
  const root = _workspaceRoot;
  return {
    read_file: {
      definition: toDef('read_file', 'Read the contents of a file', {
        path: { type: 'string', description: 'Path to the file relative to the workspace root' },
      }),
      execute: (args) => safeReadFile(root, String(args['path'] ?? '')),
    },
    write_file: {
      definition: toDef('write_file', 'Write content to a file (creates parent directories)', {
        path: { type: 'string', description: 'Path to the file relative to the workspace root' },
        content: { type: 'string', description: 'Text content to write' },
      }),
      execute: (args) => safeWriteFile(root, String(args['path'] ?? ''), String(args['content'] ?? '')),
    },
    list_files: {
      definition: toDef('list_files', 'List files in a directory', {
        path: { type: 'string', description: 'Directory path relative to the workspace root' },
      }),
      execute: (args) => safeListFiles(root, String(args['path'] ?? '.')),
    },
  };
}
