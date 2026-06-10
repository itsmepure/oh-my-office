// @repo/agents/loop — tool-calling loop.
//
// Given an agent config (snapshot), task context, and a provider, runs the
// iterative tool-calling loop: prompt → response → tool calls → execute →
// feed results → prompt again → ... until the model produces a final text
// response or the iteration limit is reached.
//
// The loop emits events via the `onEvent` callback so the caller (orchestrator)
// can persist them, stream them, and drive the pixel office.

import type { Provider, GenerateResult, ToolDefinition } from './provider.js';
import type { RegisteredTool } from './tools.js';
import type { AgentView } from '@repo/shared';

// ── Types ──────────────────────────────────────────────────────────────────

/** One turn of the agent loop. */
export interface LoopTurn {
  /** Index of this turn (0-based). */
  turn: number;
  /** What the model returned this turn. */
  result: GenerateResult;
  /** Tool results executed this turn (if any). */
  toolResults: Array<{ name: string; success: boolean; output: string }>;
}

export interface LoopResult {
  /** Final text output from the agent. */
  output: string;
  /** Every turn, in order. */
  turns: LoopTurn[];
  /** Total tokens used. */
  totalTokens: { input: number; output: number };
}

export interface LoopConfig {
  provider: Provider;
  /** Agent snapshot (systemPrompt + modelConfig). */
  agent: Pick<AgentView, 'systemPrompt' | 'modelConfig' | 'name' | 'role'>;
  /** The user's task prompt concatenated with prior step outputs. */
  taskContext: string;
  /** Available tools for this agent. */
  toolRegistry: Record<string, RegisteredTool>;
  /** Optional knowledge docs text to inject into the system prompt. */
  knowledgeText?: string;
  /** Max tool-calling iterations (safety valve). */
  maxIterations?: number;
  /**
   * Override for `agentRef` emitted on every loop event. Defaults to the
   * agent's display name. Callers that need a stable ref (e.g. the
   * orchestrator mapping events back to a specific OfficeAgent) should set
   * this to the OfficeAgent id so all events for one agent share a ref.
   */
  agentRefOverride?: string;
  /** Called for every event the loop wants to emit. */
  onEvent?: (event: LoopEvent) => void | Promise<void>;
}

/** Events the loop emits. */
export type LoopEvent =
  | { type: 'agent.thinking'; agentRef: string }
  | { type: 'agent.tool_call'; agentRef: string; tool: string; args: Record<string, unknown> }
  | { type: 'agent.output'; agentRef: string; output: string };

// ── Implementation ─────────────────────────────────────────────────────────

export async function runAgentLoop(config: LoopConfig): Promise<LoopResult> {
  const maxIter = config.maxIterations ?? 10;
  const turns: LoopTurn[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  const agentRef = config.agentRefOverride ?? config.agent.name;

  // Build system prompt: base prompt + optional knowledge docs.
  let systemPrompt = config.agent.systemPrompt;
  if (config.knowledgeText) {
    systemPrompt += `\n\n--- Knowledge Documents ---\n${config.knowledgeText}`;
  }

  // Prepare tool definitions for the provider.
  const toolDefs: ToolDefinition[] = Object.values(config.toolRegistry).map((rt) => ({
    name: rt.definition.name,
    description: rt.definition.description,
    parameters: rt.definition.parameters,
  }));

  let userPrompt = config.taskContext;

  for (let i = 0; i < maxIter; i++) {
    // Emit: agent is thinking.
    await config.onEvent?.({ type: 'agent.thinking', agentRef });

    const model = typeof config.agent.modelConfig?.['model'] === 'string'
      ? config.agent.modelConfig.model
      : undefined;
    const temperature = typeof config.agent.modelConfig?.['temperature'] === 'number'
      ? config.agent.modelConfig.temperature
      : undefined;

    const result = await config.provider.generate({
      systemPrompt,
      userPrompt,
      tools: toolDefs,
      model,
      temperature,
    });

    if (result.usage) {
      totalInput += result.usage.input;
      totalOutput += result.usage.output;
    }

    const toolResults: LoopTurn['toolResults'] = [];

    // Execute any tool calls.
    for (const tc of result.toolCalls) {
      // Emit: agent called a tool.
      await config.onEvent?.({ type: 'agent.tool_call', agentRef, tool: tc.name, args: tc.args });

      const registered = config.toolRegistry[tc.name];
      let execResult: { success: boolean; output: string };
      if (!registered) {
        execResult = { success: false, output: `Unknown tool: ${tc.name}` };
      } else {
        try {
          execResult = await registered.execute(tc.args, '');
        } catch (err) {
          execResult = { success: false, output: `Tool error: ${(err as Error).message}` };
        }
      }
      toolResults.push({ name: tc.name, ...execResult });

      // Feed the tool result back as a user message.
      userPrompt += `\n\n[Tool result for ${tc.name}]: ${execResult.output}`;
    }

    turns.push({ turn: i, result, toolResults });

    // If the model returned text and no tool calls, it's done.
    if (result.text && result.toolCalls.length === 0) {
      await config.onEvent?.({ type: 'agent.output', agentRef, output: result.text });
      return { output: result.text, turns, totalTokens: { input: totalInput, output: totalOutput } };
    }

    // If the model returned text WITH tool calls, the text is its reasoning
    // before acting. Append it to the user prompt as context for the next turn.
    if (result.text) {
      userPrompt += `\n\n[Assistant]: ${result.text}`;
    }
  }

  // Exhausted iterations — return whatever text we have.
  const lastText = turns[turns.length - 1]?.result.text || '(agent loop exhausted)';
  await config.onEvent?.({ type: 'agent.output', agentRef, output: lastText });
  return { output: lastText, turns, totalTokens: { input: totalInput, output: totalOutput } };
}
