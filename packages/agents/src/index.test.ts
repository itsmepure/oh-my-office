// Unit tests for packages/agents — provider, path guard, tools, agent loop.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  FakeProvider,
  guardPath,
  PathEscapeError,
  createToolRegistry,
  runAgentLoop,
} from './index.js';

// ── FakeProvider ───────────────────────────────────────────────────────────

describe('FakeProvider', () => {
  it('returns pre-configured responses in order', async () => {
    const fake = new FakeProvider([
      { toolCalls: [{ name: 'read_file', args: { path: 'x' } }] },
      { text: 'Done.' },
    ]);
    const r1 = await fake.generate({ systemPrompt: '', userPrompt: '', tools: [] });
    expect(r1.toolCalls).toHaveLength(1);
    expect(r1.toolCalls[0]?.name).toBe('read_file');

    const r2 = await fake.generate({ systemPrompt: '', userPrompt: '', tools: [] });
    expect(r2.text).toBe('Done.');
    expect(r2.toolCalls).toHaveLength(0);
  });

  it('returns a default response when exhausted', async () => {
    const fake = new FakeProvider([]);
    const r = await fake.generate({ systemPrompt: '', userPrompt: '', tools: [] });
    expect(r.text).toContain('exhausted');
  });

  it('reset() restarts from beginning', async () => {
    const fake = new FakeProvider([{ text: 'first' }]);
    await fake.generate({ systemPrompt: '', userPrompt: '', tools: [] });
    fake.reset();
    const r = await fake.generate({ systemPrompt: '', userPrompt: '', tools: [] });
    expect(r.text).toBe('first');
  });
});

// ── Path Guard ─────────────────────────────────────────────────────────────

describe('path guard', () => {
  const root = 'D:\\workspaces\\office-1';

  it('allows paths inside the root', () => {
    expect(guardPath(root, 'file.txt')).toBe(resolve(root, 'file.txt'));
    expect(guardPath(root, 'subdir/file.txt')).toBe(resolve(root, 'subdir/file.txt'));
    expect(guardPath(root, '.')).toBe(resolve(root));
  });

  it('rejects path escape via ../', () => {
    expect(() => guardPath(root, '../../../etc/passwd')).toThrow(PathEscapeError);
    expect(() => guardPath(root, '..\\..\\Windows\\System32')).toThrow(PathEscapeError);
  });

  it('rejects absolute path outside root', () => {
    expect(() => guardPath(root, '/etc/passwd')).toThrow(PathEscapeError);
    expect(() => guardPath(root, 'C:\\Windows\\System32')).toThrow(PathEscapeError);
  });

  it('handles Windows-drive edge cases', () => {
    const winRoot = 'D:\\workspaces\\office-1';
    expect(() => guardPath(winRoot, 'D:\\etc')).toThrow(PathEscapeError);
    expect(guardPath(winRoot, 'D:\\workspaces\\office-1\\sub')).toBe(resolve(winRoot, 'sub'));
  });
});

// ── Tools (with real filesystem) ───────────────────────────────────────────

describe('tools', () => {
  let wsRoot: string;

  beforeAll(async () => {
    wsRoot = resolve(tmpdir(), `hermes-p6-tools-${randomUUID()}`);
    await mkdir(wsRoot, { recursive: true });
    await writeFile(resolve(wsRoot, 'hello.txt'), 'world', 'utf-8');
  });

  afterAll(async () => {
    await rm(wsRoot, { recursive: true, force: true }).catch(() => {});
  });

  it('read_file reads content', async () => {
    const registry = createToolRegistry(wsRoot);
    const result = await registry.read_file!.execute({ path: 'hello.txt' }, wsRoot);
    expect(result.success).toBe(true);
    expect(result.output).toBe('world');
  });

  it('read_file rejects path escape', async () => {
    const registry = createToolRegistry(wsRoot);
    await expect(
      registry.read_file!.execute({ path: '../../../etc/passwd' }, wsRoot),
    ).rejects.toThrow(PathEscapeError);
  });

  it('write_file creates file and parent dirs', async () => {
    const registry = createToolRegistry(wsRoot);
    const result = await registry.write_file!.execute(
      { path: 'sub/deep/nested.txt', content: 'nested content' },
      wsRoot,
    );
    expect(result.success).toBe(true);
    // Verify file was created.
    const { readFile } = await import('node:fs/promises');
    const contents = await readFile(resolve(wsRoot, 'sub/deep/nested.txt'), 'utf-8');
    expect(contents).toBe('nested content');
  });

  it('write_file rejects path escape', async () => {
    const registry = createToolRegistry(wsRoot);
    await expect(
      registry.write_file!.execute(
        { path: '../../../malicious.sh', content: 'bad' },
        wsRoot,
      ),
    ).rejects.toThrow(PathEscapeError);
  });

  it('list_files returns directory listing', async () => {
    const registry = createToolRegistry(wsRoot);
    const result = await registry.list_files!.execute({ path: '.' }, wsRoot);
    expect(result.success).toBe(true);
    const data = result.data as Array<{ name: string; type: string }>;
    expect(data.some((e) => e.name === 'hello.txt')).toBe(true);
  });
});

// ── Agent Loop (with FakeProvider) ─────────────────────────────────────────

describe('agent loop', () => {
  it('executes a single-turn task (no tool calls)', async () => {
    const fake = new FakeProvider([{ text: 'The answer is 42.' }]);
    const result = await runAgentLoop({
      provider: fake,
      agent: { name: 'Bot', role: 'Solver', systemPrompt: 'You are helpful.', modelConfig: {} },
      taskContext: 'What is the answer?',
      toolRegistry: {},
    });
    expect(result.output).toBe('The answer is 42.');
    expect(result.turns).toHaveLength(1);
  });

  it('executes tool calls and feeds results', async () => {
    // Turn 1: model calls read_file
    // Turn 2: model responds with text
    const fake = new FakeProvider([
      { toolCalls: [{ name: 'read_file', args: { path: 'data.txt' } }] },
      { text: 'File contained: hello' },
    ]);
    const result = await runAgentLoop({
      provider: fake,
      agent: { name: 'Bot', role: 'Reader', systemPrompt: '', modelConfig: {} },
      taskContext: 'Read the file.',
      toolRegistry: {
        read_file: {
          definition: { name: 'read_file', description: '', parameters: {} },
          execute: async () => ({ success: true, output: 'hello' }),
        },
      } as Record<string, import('./index.js').RegisteredTool>,
    });
    expect(result.output).toBe('File contained: hello');
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]?.toolResults[0]?.name).toBe('read_file');
    expect(result.turns[0]?.toolResults[0]?.output).toBe('hello');
  });

  it('emits events for each phase', async () => {
    const events: string[] = [];
    const fake = new FakeProvider([{ text: 'Done.' }]);
    await runAgentLoop({
      provider: fake,
      agent: { name: 'Bot', role: 'R', systemPrompt: '', modelConfig: {} },
      taskContext: 'x',
      toolRegistry: {},
      onEvent: (e) => { events.push(e.type); },
    });
    expect(events).toEqual(['agent.thinking', 'agent.output']);
  });

  it('defaults agentRef to the agent display name when no override is given', async () => {
    const refs = new Set<string>();
    const fake = new FakeProvider([{ text: 'Done.' }]);
    await runAgentLoop({
      provider: fake,
      agent: { name: 'Planner', role: 'planner', systemPrompt: '', modelConfig: {} },
      taskContext: 'x',
      toolRegistry: {},
      onEvent: (e) => { refs.add(e.agentRef); },
    });
    expect(Array.from(refs)).toEqual(['Planner']);
  });

  it('uses agentRefOverride on EVERY emitted event (cross-event invariant)', async () => {
    // Regression guard: the pixel-office scene maps events to sprites by
    // agentRef. step.start/step.done (emitted by the orchestrator with the
    // OfficeAgent UUID) must share the ref with the inner loop events
    // (thinking, tool_call, output). Before the override existed those inner
    // events leaked the agent display name and broke sprite routing.
    const refs = new Set<string>();
    const officeAgentId = 'office-agent-uuid-1234';
    const fake = new FakeProvider([
      { toolCalls: [{ name: 'read_file', args: { path: 'x' } }] },
      { text: 'Final answer.' },
    ]);
    const eventTypes: string[] = [];
    await runAgentLoop({
      provider: fake,
      // Display name deliberately DIFFERENT from the override.
      agent: { name: 'Planner', role: 'planner', systemPrompt: '', modelConfig: {} },
      taskContext: 'x',
      toolRegistry: {
        read_file: {
          definition: { name: 'read_file', description: '', parameters: {} },
          execute: async () => ({ success: true, output: 'ok' }),
        },
      } as Record<string, import('./index.js').RegisteredTool>,
      agentRefOverride: officeAgentId,
      onEvent: (e) => { refs.add(e.agentRef); eventTypes.push(e.type); },
    });
    // Multiple event types fired (so the assertion is meaningful)...
    expect(eventTypes).toContain('agent.thinking');
    expect(eventTypes).toContain('agent.tool_call');
    expect(eventTypes).toContain('agent.output');
    // ...and EVERY one carried the override ref, never the display name.
    expect(Array.from(refs)).toEqual([officeAgentId]);
  });

  it('stops after maxIterations', async () => {
    // Provider always returns tool calls → loop would never end.
    const fake = new FakeProvider(
      Array.from({ length: 20 }, () => ({
        toolCalls: [{ name: 'read_file', args: { path: 'x' } }],
      })),
    );
    const result = await runAgentLoop({
      provider: fake,
      agent: { name: 'Bot', role: 'R', systemPrompt: '', modelConfig: {} },
      taskContext: 'x',
      toolRegistry: {
        read_file: {
          definition: { name: 'read_file', description: '', parameters: {} },
          execute: async () => ({ success: true, output: 'ok' }),
        },
      },
      maxIterations: 3,
    });
    expect(result.turns).toHaveLength(3);
    expect(result.output).toContain('exhausted');
  });
});
