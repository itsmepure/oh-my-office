// @repo/shared — typed command/event contracts (Zod).
// Single source of truth for cross-process payloads (web ↔ orchestrator).

export const SHARED_PACKAGE_VERSION = '0.1.0';

export * from './ids.js';
export * from './events.js';
export * from './commands.js';
export * from './views.js';
export * from './parse.js';
