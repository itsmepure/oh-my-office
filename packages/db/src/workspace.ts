// @repo/db/workspace — tenant-scoped access to an office's workspace files
// (Phase G1). Lets the web app list + download files the agents produced.
//
// SECURITY: every path goes through the SAME guardPath() used by the agent
// tools (Non-Negotiable Rule #4) — no second path-resolution implementation.
// Reads are scoped by OfficeMembership so a user can only touch their own
// office's files.

import { resolve, isAbsolute, relative, sep } from 'node:path';
import { stat, readdir, readFile } from 'node:fs/promises';
import { guardPath, PathEscapeError } from '@repo/agents';
import { prisma } from './index.js';

export { PathEscapeError };

export interface WorkspaceFile {
  /** Path relative to the workspace root, POSIX-style for the UI. */
  relPath: string;
  size: number;
  /** ISO mtime. */
  modifiedAt: string;
}

/**
 * Resolve an office's absolute workspace root, mirroring the runner's logic:
 * absolute paths used as-is; relative paths resolved against the monorepo root.
 * Returns null if the user has no access to the office.
 */
async function resolveWorkspaceRoot(officeId: string, userId: string): Promise<string | null> {
  const office = await prisma.office.findFirst({
    where: { id: officeId, memberships: { some: { userId } } },
    select: { workspacePath: true },
  });
  if (!office) return null;
  return isAbsolute(office.workspacePath)
    ? office.workspacePath
    : resolve(process.cwd(), office.workspacePath);
}

/** Recursively walk a directory, returning files relative to `root`. */
async function walk(root: string, dir: string, acc: WorkspaceFile[]): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as unknown as import('node:fs').Dirent[];
  } catch {
    return; // missing dir → empty
  }
  for (const entry of entries) {
    const name = String(entry.name);
    const abs = resolve(dir, name);
    if (entry.isDirectory()) {
      // Skip hidden/system dirs.
      if (name.startsWith('.')) continue;
      await walk(root, abs, acc);
    } else if (entry.isFile()) {
      const info = await stat(abs);
      acc.push({
        relPath: relative(root, abs).split(sep).join('/'),
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    }
  }
}

/**
 * List every file in the office workspace (tenant-scoped). Returns null if the
 * user has no access; an empty array if the workspace has no files yet.
 */
export async function listWorkspaceFiles(
  officeId: string,
  userId: string,
): Promise<WorkspaceFile[] | null> {
  const root = await resolveWorkspaceRoot(officeId, userId);
  if (root === null) return null;
  const files: WorkspaceFile[] = [];
  await walk(root, root, files);
  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return files;
}

export interface WorkspaceFileContent {
  relPath: string;
  /** Raw bytes for download. */
  bytes: Buffer;
}

/**
 * Read a single workspace file for download. Path is guarded (escape → throws
 * PathEscapeError). Returns null if no access; throws on escape; returns the
 * file bytes otherwise.
 */
export async function readWorkspaceFile(
  officeId: string,
  userId: string,
  requestedRelPath: string,
): Promise<WorkspaceFileContent | null> {
  const root = await resolveWorkspaceRoot(officeId, userId);
  if (root === null) return null;
  const safe = guardPath(root, requestedRelPath); // throws PathEscapeError on escape
  const bytes = await readFile(safe);
  return { relPath: relative(root, safe).split(sep).join('/'), bytes };
}

/** Resolve the workspace root for zipping (tenant-scoped). null = no access. */
export async function getWorkspaceRoot(officeId: string, userId: string): Promise<string | null> {
  return resolveWorkspaceRoot(officeId, userId);
}
