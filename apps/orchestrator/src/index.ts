// apps/orchestrator — long-running workflow execution daemon.
//
// On startup: loads env, starts the realtime WebSocket server, reconciles any
// stuck tasks, then enters the DB-backed poll loop.
//
// Phase 7: WebSocket events are broadcast by persistEvent() AFTER durable DB
// writes, so reconnecting clients can always replay from Postgres.

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { AnthropicProvider, OpenAICompatibleProvider, type Provider } from '@repo/agents';
import { reconcileStuckTasks, dequeueTask } from './queue.js';
import { runTask } from './runner.js';
import { startRealtimeServer, type RealtimeServerHandle } from './realtime.js';

// Load env from both the package cwd and the monorepo root. `pnpm --filter`
// usually runs from the package dir; `pnpm dev` from root may differ.
for (const candidate of ['.env.local', '.env', '../../.env.local', '../../.env']) {
  loadEnv({ path: resolve(process.cwd(), candidate), override: false });
}

const POLL_INTERVAL_MS = 5_000;
const REALTIME_PORT = Number(process.env['ORCHESTRATOR_WS_PORT'] ?? 3001);

// Secrets are read from env only — never hardcoded.
const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] ?? '';
const LLM_API_KEY = process.env['LLM_API_KEY'] ?? '';
const AUTH_SECRET = process.env['AUTH_SECRET'] ?? '';

/** Pick the LLM provider: OpenAI-compatible (DeepSeek/router) if LLM_API_KEY
 * is set, else Anthropic. Keeps the provider interface (Non-Negotiable #3). */
function buildProvider(): Provider {
  if (LLM_API_KEY) {
    const baseUrl = process.env['LLM_BASE_URL'] ?? 'https://api.deepseek.com';
    const model = process.env['LLM_MODEL'] ?? 'deepseek-v4-pro';
    console.log(`[orchestrator] LLM provider: OpenAI-compatible (${baseUrl}, model=${model})`);
    return new OpenAICompatibleProvider({ apiKey: LLM_API_KEY, baseUrl, model });
  }
  console.log('[orchestrator] LLM provider: Anthropic');
  return new AnthropicProvider(ANTHROPIC_API_KEY);
}

async function main(): Promise<void> {
  console.log('[orchestrator] Starting workflow daemon...');

  if (!LLM_API_KEY && !ANTHROPIC_API_KEY) {
    console.warn(
      '[orchestrator] ⚠ No LLM key set (LLM_API_KEY or ANTHROPIC_API_KEY) — LLM calls will fail. ' +
      'Set one in the orchestrator env or root .env.',
    );
  }

  if (!AUTH_SECRET) {
    throw new Error('AUTH_SECRET is required for realtime WebSocket auth tokens');
  }

  // 1. Start realtime server before polling so events emitted immediately
  // after startup can be broadcast.
  const realtime: RealtimeServerHandle = startRealtimeServer({
    port: REALTIME_PORT,
    authSecret: AUTH_SECRET,
  });

  // 2. Reconcile any tasks stuck in 'running' from a crashed instance.
  await reconcileStuckTasks();

  const provider = buildProvider();

  // 3. Main poll loop.
  console.log(`[orchestrator] Polling for queued tasks every ${POLL_INTERVAL_MS}ms...`);

  const poll = async (): Promise<void> => {
    try {
      const task = await dequeueTask();
      if (task) {
        console.log(`[orchestrator] Dequeued task ${task.id} for office ${task.officeId}`);
        // Run the task in the background — don't block the poll loop.
        runTask(task, { provider }).catch((err: unknown) => {
          console.error(`[orchestrator] Task ${task.id} failed:`, err);
        });
      }
    } catch (err) {
      console.error('[orchestrator] Poll error:', err);
    }
  };

  const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  // Also run immediately on startup.
  void poll();

  // 4. Graceful shutdown.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[orchestrator] Received ${signal}, shutting down...`);
    clearInterval(pollTimer);
    await realtime.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((err) => {
  console.error('[orchestrator] Fatal startup error:', err);
  process.exit(1);
});
