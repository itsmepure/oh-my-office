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

import type { Provider } from '@repo/agents';
import { runAgentLoop, createToolRegistry } from '@repo/agents';
import { prisma } from '@repo/db';
import type { Event as SharedEvent, AgentView } from '@repo/shared';
import { persistEvent } from './events.js';
import { completeTask } from './queue.js';
import type { QueuedTask } from './queue.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RunOptions {
  provider: Provider;
  /** Max tool-calling iterations per agent step. */
  maxIterations?: number;
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
  const { provider, maxIterations = 10 } = opts;

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

  const workspaceRoot = office.workspacePath;

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

    // Run the loop.
    try {
      const loopResult = await runAgentLoop({
        provider,
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
