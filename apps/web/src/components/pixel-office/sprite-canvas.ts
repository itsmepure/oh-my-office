// Character sprite-sheet config + helpers for the pixel office.
//
// Characters come from the LimeZu "Character Generator 2.0" export. Each agent
// role has a PNG sheet at apps/web/public/pixel-office/characters/<role>.png.
//
// VERIFIED STRUCTURE (via alpha + skin-pixel analysis, not guessing):
//   - Sheet 896×640, frames are 16 WIDE × 32 TALL (NOT 32×32 — that bug crammed
//     two adjacent frames into one crop = the "double character").
//   - Grid 56 cols × 20 rows.
//   - Row 0 = 4-frame IDLE facing UP (back of head, no face) — what the office
//     desks need (chairs face up / away from camera).
//   - Row 3 = idle facing DOWN (face visible) — for reference.

export const FRAME_W = 16;
export const FRAME_H = 32;
export const SHEET_COLS = 56;
export const SHEET_ROWS = 20;

/**
 * Animation clips (16×32 frames). Row 0 verified UP-idle, row 3 DOWN.
 * Walk rows are best-mapped from analysis (tunable — adjust row + reload):
 *   - desk sitting uses UP-facing rows (chairs face away from camera)
 *   - roaming uses directional walk rows
 * `start`=first column, `frames`=count, `fps`=speed.
 */
export const CLIPS = {
  // Desk: sit still (single frame, no animation) — back to camera.
  sitStill: { row: 0, start: 0, frames: 1, fps: 1 },
  // Desk: working = typing motion, up-facing.
  workType: { row: 2, start: 0, frames: 8, fps: 9 },
  // Roaming walk cycles (facing = movement direction).
  walkDown: { row: 4, start: 0, frames: 6, fps: 8 },
  walkUp: { row: 1, start: 0, frames: 6, fps: 8 },
  walkLeft: { row: 18, start: 0, frames: 6, fps: 8 },
  walkRight: { row: 17, start: 0, frames: 6, fps: 8 },
  // Standing idle while roaming (down-facing so they look "present").
  standDown: { row: 3, start: 0, frames: 6, fps: 3 },
} as const;

export type ClipName = keyof typeof CLIPS;

const KNOWN_SHEETS: Record<string, string> = {
  planner: '/pixel-office/characters/Planner.png',
  coder: '/pixel-office/characters/coder.png',
  reviewer: '/pixel-office/characters/reviewer.png',
};

const FALLBACK_SHEETS = [
  '/pixel-office/characters/Planner.png',
  '/pixel-office/characters/coder.png',
  '/pixel-office/characters/reviewer.png',
];

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Resolve the character sheet URL for an agent. Matches by role name
 * (case-insensitive); unknown roles get a stable sheet picked by hash so a
 * custom agent still renders a consistent character.
 */
export function sheetUrlFor(role: string, seed: string): string {
  const key = role.trim().toLowerCase();
  if (KNOWN_SHEETS[key]) return KNOWN_SHEETS[key]!;
  return FALLBACK_SHEETS[hashString(seed) % FALLBACK_SHEETS.length]!;
}

/** Background image path. */
export const OFFICE_BG_URL = '/pixel-office/office-bg.png';
