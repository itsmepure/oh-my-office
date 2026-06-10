// @repo/agents/provider — LLM abstraction for the tool-calling loop.
//
// Every provider implements `generate()` which takes a prompt + tools and
// returns either text or tool calls. The orchestrator ONLY imports the
// interface — never a concrete provider directly. Tests inject FakeProvider.
//
// Non-Negotiable Rule #3: "LLM always behind the provider interface".

/** Describes a tool the agent may call. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

/** A tool call returned by the model. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Request to the LLM. */
export interface GenerateParams {
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
  temperature?: number;
  model?: string;
  /** Optional API key. If not set, the provider reads from env. */
  apiKey?: string;
}

/** Response from the LLM. */
export interface GenerateResult {
  /** Text content of the final message (may be empty if tool calls are present). */
  text: string;
  /** Tool calls the model wants to make. */
  toolCalls: ToolCall[];
  /** Token usage if available. */
  usage?: { input: number; output: number };
}

/** All providers conform to this interface. */
export interface Provider {
  generate(params: GenerateParams): Promise<GenerateResult>;
}

// ── FakeProvider (for tests / CI) ─────────────────────────────────────────

/**
 * Deterministic provider that returns pre-configured responses. Useful for
 * testing the tool-calling loop without live LLM calls (Non-Negotiable Rule #3).
 *
 * Usage:
 *   const fake = new FakeProvider([
 *     { toolCalls: [{ name: 'read_file', args: { path: 'f.txt' } }] },
 *     { text: 'Done.' },
 *   ]);
 */
export class FakeProvider implements Provider {
  private idx = 0;

  constructor(
    private readonly responses: Array<{
      text?: string;
      toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    }>,
  ) {}

  async generate(_params: GenerateParams): Promise<GenerateResult> {
    if (this.idx >= this.responses.length) {
      // Default: return "done" if we run out of pre-configured responses.
      return { text: 'Done (FakeProvider exhausted)', toolCalls: [] };
    }
    const next = this.responses[this.idx++]!;
    return {
      text: next.text ?? '',
      toolCalls: (next.toolCalls ?? []).map((tc, i) => ({
        id: `fake-tc-${this.idx}-${i}`,
        ...tc,
      })),
    };
  }

  /** Reset to the first response (for reuse in the same test). */
  reset(): void {
    this.idx = 0;
  }
}

// ── AnthropicProvider (real LLM) ──────────────────────────────────────────

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1/messages';

/**
 * Calls the Anthropic Messages API with tool-use support.
 * Requires `ANTHROPIC_API_KEY` env var (or pass apiKey in params).
 */
export class AnthropicProvider implements Provider {
  private readonly defaultApiKey: string;

  constructor(apiKey?: string) {
    this.defaultApiKey = apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const apiKey = params.apiKey ?? this.defaultApiKey;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const model = params.model ?? 'claude-sonnet-4-20250514';
    const temperature = params.temperature ?? 0.3;

    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      temperature,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
    };

    if (params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch(ANTHROPIC_API_BASE, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...(process.env['ANTHROPIC_BETA'] ? { 'anthropic-beta': process.env['ANTHROPIC_BETA'] } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${errBody.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string; name?: string; id?: string; input?: Record<string, unknown> }>;
      usage?: { input_tokens: number; output_tokens: number };
      stop_reason?: string;
    };

    const text = data.content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text!)
      .join('');

    const toolCalls: ToolCall[] = data.content
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({
        id: c.id ?? `tc-${Date.now()}`,
        name: c.name ?? 'unknown',
        args: c.input ?? {},
      }));

    return {
      text,
      toolCalls,
      usage: data.usage
        ? { input: data.usage.input_tokens, output: data.usage.output_tokens }
        : undefined,
    };
  }
}
