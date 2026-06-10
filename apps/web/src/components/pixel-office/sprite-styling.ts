// Deterministic per-agent visual styling for the pixel office.
//
// We deliberately avoid bundling a third-party tileset (asset-licensing is an
// open question per plan.md §Phase 8). Instead, each agent gets:
//   - a hue derived from a stable hash of its `agentRef` (or `name`)
//   - a body / accent pair sampled from a curated palette
//   - a tinted background halo color for the "spotlight" effect
//
// These helpers are pure — the same input always yields the same color set —
// which is what makes the scene rebuild correctly from a DB replay.

import type { AgentVisualState } from './event-to-state';

const PALETTE: ReadonlyArray<{ body: number; accent: number; halo: number; label: string }> = [
  { body: 0x4f86f7, accent: 0xa8c7ff, halo: 0x4f86f7, label: 'blue' },
  { body: 0xe85d75, accent: 0xffb3c1, halo: 0xe85d75, label: 'pink' },
  { body: 0x4caf78, accent: 0xa6e2bf, halo: 0x4caf78, label: 'green' },
  { body: 0xf2a93b, accent: 0xffd99b, halo: 0xf2a93b, label: 'amber' },
  { body: 0x9b6bff, accent: 0xd4c2ff, halo: 0x9b6bff, label: 'violet' },
  { body: 0x36c5d0, accent: 0x9eecf2, halo: 0x36c5d0, label: 'teal' },
  { body: 0xd65a31, accent: 0xffb499, halo: 0xd65a31, label: 'rust' },
  { body: 0x8a8f9b, accent: 0xc8ccd4, halo: 0x8a8f9b, label: 'slate' },
];

/** djb2-style hash. Stable across runs and platforms. */
function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface AgentStyle {
  body: number;
  accent: number;
  halo: number;
  /** Color for the agent's name label, as a CSS hex string. */
  labelColor: string;
  /** 0-1 brightness factor used to tint sprites by current visual state. */
  brightness: number;
}

function toHex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Stable per-agent style. */
export function agentStyleFor(seed: string): AgentStyle {
  const idx = hashString(seed) % PALETTE.length;
  const swatch = PALETTE[idx]!;
  return {
    body: swatch.body,
    accent: swatch.accent,
    halo: swatch.halo,
    labelColor: toHex(swatch.body),
    brightness: 1,
  };
}

/**
 * Curated hair colors. Picked from a second hash dimension so two agents with
 * the same shirt color still usually differ in hair — gives each desk a
 * distinct occupant without bundling any external asset.
 */
const HAIR_PALETTE: ReadonlyArray<number> = [
  0x2b2118, // dark brown
  0x3a2a1a, // brown
  0x1a1a1f, // near-black
  0x5a3a22, // chestnut
  0x6b4a2b, // light brown
  0x8a6a3a, // dirty blond
  0xc9a24b, // blond
  0x7a3b2b, // auburn
  0x9aa0aa, // grey
];

/** Deterministic hair color for an agent, independent of shirt color. */
export function hairColorFor(seed: string): number {
  // Offset the hash so hair and shirt indices decorrelate.
  const h = hashString(`hair:${seed}`);
  return HAIR_PALETTE[h % HAIR_PALETTE.length]!;
}

/** Deterministic skin tone for an agent (small curated range). */
const SKIN_PALETTE: ReadonlyArray<number> = [
  0xf2c9a4, // light
  0xe0ac81, // medium-light
  0xc68642, // medium
  0x8d5524, // deep
];

export function skinToneFor(seed: string): number {
  const h = hashString(`skin:${seed}`);
  return SKIN_PALETTE[h % SKIN_PALETTE.length]!;
}

/** Per-state brightness factor used to dim/brighten the sprite body. */
export function brightnessFor(state: AgentVisualState): number {
  switch (state) {
    case 'idle':
      return 0.55;
    case 'thinking':
      return 0.85;
    case 'working':
      return 1;
    case 'done':
      return 0.95;
  }
}
