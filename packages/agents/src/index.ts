// @repo/agents — agent runtime: tool-calling loop + sandboxed file ops.
// Export stable surface for the orchestrator daemon.

export const AGENTS_PACKAGE_VERSION = '0.2.0';

export { FakeProvider, AnthropicProvider, OpenAICompatibleProvider } from './provider.js';
export type { Provider, GenerateParams, GenerateResult, ToolCall, ToolDefinition } from './provider.js';

export { createToolRegistry, guardPath, safeReadFile, safeWriteFile, safeListFiles, PathEscapeError } from './tools.js';
export type { RegisteredTool, ToolResult, ToolDef } from './tools.js';

export { runAgentLoop } from './loop.js';
export type { LoopConfig, LoopResult, LoopTurn, LoopEvent } from './loop.js';
