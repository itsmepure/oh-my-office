// apps/orchestrator/src/runner — deterministic pipeline execution.
//
// Given a task (QueuedTask), the runner:
//   1. Loads the office + its OfficeAgents (snapshots) in step order
//   2. For each OfficeAgent:
//      a. Loads the source agent's knowledge docs
//      b. Creates a tool registry bound to the office's workspacePath
//      c. Runs the AgentLoop with task.prompt + prior step outputs
//      d. Persists events (step.start → agent.* → step.done)
//   3. On success: marks task done, persists artifacts
//   4. On failure: marks task failed
//
// Built to be testable — the Provider is injected (real or FakeProvider),
// all DB access is through the queue/events helpers so we can mock them.

import { resolve, isAbsolute } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Provider } from '@repo/agents';
import { runAgentLoop, createToolRegistry, OpenAICompatibleProvider } from '@repo/agents';
import { prisma } from '@repo/db';
import {
  reserve,
  settle,
  release,
  canAffordMinStep,
  tokensToCredits,
  MIN_STEP_CREDITS,
  InsufficientCreditsError,
  type Reservation,
} from '@repo/db/credits';
import { resolveOfficeKey, type ResolvedKey } from '@repo/db/keys';
import type { Event as SharedEvent, AgentView } from '@repo/shared';
import { persistEvent } from './events.js';
import { completeTask } from './queue.js';
import type { QueuedTask } from './queue.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunOptions {
  /** Provider used when the office runs on the PLATFORM key (bills credits). */
  provider: Provider;
  /** Max tool-calling iterations per agent step. */
  maxIterations?: number;
  /**
   * Factory that builds a Provider from a resolved BYOK key. Injectable for
   * tests; defaults to OpenAICompatibleProvider. When an office has a BYOK key,
   * the runner uses this instead of `provider` and bills zero credits.
   */
  makeByokProvider?: (key: ResolvedKey) => Provider;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Execute a single task through its office's pipeline. Returns void — all
 * state is persisted via events + task status updates. Throws on hard
 * failures (DB down, provider auth error) that should crash the worker.
 */
export async function runTask(
  task: QueuedTask,
  opts: RunOptions,
): Promise<void> {
  const { provider, maxIterations = 10, makeByokProvider } = opts;

  // 1. Load office + agents.
  const office = await prisma.office.findUnique({
    where: { id: task.officeId },
    include: {
      officeAgents: {
        orderBy: { stepOrder: 'asc' },
      },
    },
  });
  if (!office) {
    await completeTask(task.id, task.officeId, 'failed');
    console.error(`[runner] Office ${task.officeId} not found for task ${task.id}`);
    return;
  }

  const agents = office.officeAgents;
  if (agents.length === 0) {
    await completeTask(task.id, task.officeId, 'failed');
    console.error(`[runner] Office ${task.officeId} has no agents`);
    return;
  }

  // ── Credit metering + BYOK setup (Phase M1 + M2) ─────────────────────────
  // Resolve the office's effective LLM key. If the owner attached a BYOK key
  // (office-scoped or account-default), the office runs on THEIR key → all
  // steps are FREE and we use a provider built from that key. Otherwise we run
  // on the platform key and bill credits for platform-agent steps.
  const ownerId = office.ownerId;
  const resolvedKey = await resolveOfficeKey(task.officeId, ownerId);
  const usingPlatformKey = !resolvedKey.isByok;

  const activeProvider: Provider = resolvedKey.isByok
    ? (makeByokProvider
        ? makeByokProvider(resolvedKey)
        : new OpenAICompatibleProvider({
            apiKey: resolvedKey.apiKey,
            baseUrl: resolvedKey.baseUrl,
            model: resolvedKey.model,
          }))
    : provider;

  // Determine which snapshot agents are platform agents by looking up the
  // source Agent by id. Snapshots don't carry ownerId, so we resolve it here.
  const snapshotIds = agents.map((oa) => parseSnapshot(oa.agentSnapshot).id);
  const platformAgentIds = new Set(
    (
      await prisma.agent.findMany({
        where: { id: { in: snapshotIds }, ownerId: null },
        select: { id: true },
      })
    ).map((a) => a.id),
  );
  const billsCredits = (snapshotId: string): boolean =>
    usingPlatformKey && platformAgentIds.has(snapshotId);
  const taskHasBillableStep = agents.some((oa) =>
    billsCredits(parseSnapshot(oa.agentSnapshot).id),
  );

  // Pre-flight guard: if any step would bill credits but the owner can't even
  // cover the minimum step, fail the task BEFORE any LLM call. The task still
  // "ran" (it just stopped immediately) — tasks are never blocked from being
  // queued, only from spending credits the user doesn't have.
  if (taskHasBillableStep && !(await canAffordMinStep(ownerId))) {
    await persistEvent({
      type: 'task.status',
      taskId: task.id,
      officeId: task.officeId,
      ts: new Date().toISOString(),
      status: 'failed',
    } as SharedEvent);
    await completeTask(task.id, task.officeId, 'failed');
    console.warn(`[runner] Task ${task.id} blocked: owner ${ownerId} out of credits`);
    return;
  }

  // Resolve the workspace root. Offices created via the app store an absolute
  // path, but defensively handle relative paths (e.g. older/seeded rows) by
  // resolving against the monorepo root (two levels up from apps/orchestrator).
  // Ensure the directory exists so file tools don't fail on a missing folder.
  const workspaceRoot = isAbsolute(office.workspacePath)
    ? office.workspacePath
    : resolve(process.cwd(), '../..', office.workspacePath);
  await mkdir(workspaceRoot, { recursive: true }).catch(() => {});

  // 2. For each step, run the agent loop.
  const priorOutputs: string[] = [];

  for (const oa of agents) {
    const stepIndex = oa.stepOrder;
    const agentSnapshot = parseSnapshot(oa.agentSnapshot);

    // Look up knowledge docs for the source agent (if any).
    let knowledgeText = '';
    try {
      const docs = await prisma.knowledgeDoc.findMany({
        where: { agentId: agentSnapshot.id },
        orderBy: { createdAt: 'asc' },
      });
      if (docs.length > 0) {
        knowledgeText = docs
          .map((d) => `## ${d.title}\n${d.content ?? ''}`)
          .join('\n\n');
      }
    } catch {
      // Docs are best-effort; skip on error.
    }

    // Build task context for this step.
    const priorText = priorOutputs.length > 0
      ? `\n\n--- Prior Step Outputs ---\n${priorOutputs.join('\n\n---\n\n')}`
      : '';
    const taskContext = `Task: ${task.prompt}${priorText}`;

    // Create tool registry for this office.
    const toolRegistry = createToolRegistry(workspaceRoot);

    // Emit step.start.
    const stepStartEvent: SharedEvent = {
      type: 'step.start',
      taskId: task.id,
      officeId: task.officeId,
      ts: new Date().toISOString(),
      stepIndex,
      agentRef: oa.id,
      role: agentSnapshot.role,
    };
    await persistEvent(stepStartEvent);

    // Reserve credits up front for billable (platform-agent) steps. Estimate a
    // conservative amount; settle to the real token cost after the loop.
    const stepBills = billsCredits(agentSnapshot.id);
    let reservation: Reservation | null = null;
    if (stepBills) {
      try {
        // Reserve a modest estimate (~1 average task's worth per step ceiling).
        reservation = await reserve(ownerId, 25);
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          const stepFailEvent: SharedEvent = {
            type: 'step.failed',
            taskId: task.id,
            officeId: task.officeId,
            ts: new Date().toISOString(),
            stepIndex,
            agentRef: oa.id,
            error: 'Out of credits — add your own API key or top up to keep using our agents.',
          };
          await persistEvent(stepFailEvent);
          await completeTask(task.id, task.officeId, 'failed');
          console.warn(`[runner] Step ${stepIndex} blocked: out of credits`);
          return;
        }
        throw err;
      }
    }

    // Run the loop.
    try {
      const loopResult = await runAgentLoop({
        provider: activeProvider,
        agent: agentSnapshot,
        taskContext,
        toolRegistry,
        knowledgeText: knowledgeText || undefined,
        maxIterations,
        // Use the OfficeAgent.id as the ref so every event for this
        // agent (thinking, tool_call, output) shares the same ref as
        // the surrounding step.start / step.done / step.failed. The
        // pixel-office scene uses this ref to map events to sprites.
        agentRefOverride: oa.id,
        onEvent: async (loopEvent) => {
          // Map agent-loop events to shared event schemas + persist.
          // The discriminated union doesn't narrow well with spread, so we
          // use a simple cast after constructing the right payload.
          const base = {
            taskId: task.id,
            officeId: task.officeId,
            ts: new Date().toISOString(),
            agentRef: loopEvent.agentRef,
          };
          let event: SharedEvent;
          if (loopEvent.type === 'agent.thinking') {
            event = { type: 'agent.thinking', ...base } as SharedEvent;
          } else if (loopEvent.type === 'agent.tool_call') {
            event = { type: 'agent.tool_call', tool: loopEvent.tool, args: loopEvent.args, ...base } as SharedEvent;
          } else {
            event = { type: 'agent.output', output: loopEvent.output, ...base } as SharedEvent;
          }
          await persistEvent(event);
        },
      });

      // Store this step's output as input to the next step.
      priorOutputs.push(`[${agentSnapshot.name} (${agentSnapshot.role})]: ${loopResult.output}`);

      // Settle credits to the real token cost for billable steps.
      if (reservation) {
        const credits = tokensToCredits(
          loopResult.totalTokens.input,
          loopResult.totalTokens.output,
        );
        await settle(reservation, Math.max(MIN_STEP_CREDITS, credits), {
          taskId: task.id,
          agentRef: oa.id,
          inputTokens: loopResult.totalTokens.input,
          outputTokens: loopResult.totalTokens.output,
        });
        reservation = null;
      }

      // Emit step.done.
      const stepDoneEvent: SharedEvent = {
        type: 'step.done',
        taskId: task.id,
        officeId: task.officeId,
        ts: new Date().toISOString(),
        stepIndex,
        agentRef: oa.id,
      };
      await persistEvent(stepDoneEvent);
    } catch (err) {
      // Step failed — release any held credits (no tokens were billed).
      if (reservation) {
        await release(reservation).catch(() => {});
        reservation = null;
      }
      // Step failed.
      const stepFailEvent: SharedEvent = {
        type: 'step.failed',
        taskId: task.id,
        officeId: task.officeId,
        ts: new Date().toISOString(),
        stepIndex,
        agentRef: oa.id,
        error: (err as Error).message,
      };
      await persistEvent(stepFailEvent);
      await completeTask(task.id, task.officeId, 'failed');
      console.error(`[runner] Step ${stepIndex} failed for task ${task.id}: ${(err as Error).message}`);
      return;
    }
  }

  // 3. Task complete — persist artifacts.
  const combinedOutput = priorOutputs.join('\n\n---\n\n');
  await prisma.artifact.create({
    data: {
      taskId: task.id,
      type: 'text',
      name: 'final-output.txt',
      content: combinedOutput,
    },
  });

  await completeTask(task.id, task.officeId, 'done');
  console.log(`[runner] Task ${task.id} completed successfully`);
}

// ── Internal ───────────────────────────────────────────────────────────────

function parseSnapshot(raw: unknown): AgentView & { id: string } {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as AgentView & { id: string };
  }
  return raw as AgentView & { id: string };
}
