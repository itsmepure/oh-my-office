// Workspace quota tests (Phase L4). Sets small caps via env BEFORE importing
// the tools module (caps are read at module load), then exercises safeWriteFile.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tight caps so the test is fast: 1 KB per file, 2 KB total.
vi.stubEnv('WORKSPACE_MAX_FILE_BYTES', '1024');
vi.stubEnv('WORKSPACE_MAX_TOTAL_BYTES', '2048');

// Dynamic import AFTER stubbing env so the module reads the small caps.
const { safeWriteFile } = await import('./tools.js');

let ws = '';
beforeAll(() => {
  ws = mkdtempSync(join(tmpdir(), 'oo-quota-'));
});
afterAll(() => {
  try { rmSync(ws, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.unstubAllEnvs();
});

describe('safeWriteFile quota', () => {
  it('allows a write under the per-file cap', async () => {
    const r = await safeWriteFile(ws, 'small.txt', 'x'.repeat(500));
    expect(r.success).toBe(true);
  });

  it('rejects a single file over the per-file cap', async () => {
    const r = await safeWriteFile(ws, 'big.txt', 'x'.repeat(2000));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/per-file limit/i);
  });

  it('rejects a write that exceeds the total-workspace cap', async () => {
    // small.txt already 500B. Add 900B (ok, total 1400), then 900B more → 2300 > 2048.
    expect((await safeWriteFile(ws, 'a.txt', 'x'.repeat(900))).success).toBe(true);
    const r = await safeWriteFile(ws, 'b.txt', 'x'.repeat(900));
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/quota exceeded/i);
  });

  it('overwriting an existing file counts the delta, not double', async () => {
    // Fresh workspace to isolate.
    const ws2 = mkdtempSync(join(tmpdir(), 'oo-quota2-'));
    expect((await safeWriteFile(ws2, 'f.txt', 'x'.repeat(900))).success).toBe(true);
    // Overwrite with same size → still under 2048 (not 1800+).
    expect((await safeWriteFile(ws2, 'f.txt', 'y'.repeat(900))).success).toBe(true);
    rmSync(ws2, { recursive: true, force: true });
  });
});
