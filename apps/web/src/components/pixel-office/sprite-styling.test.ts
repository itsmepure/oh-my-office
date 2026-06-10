import { describe, expect, it } from 'vitest';
import { agentStyleFor, brightnessFor } from './sprite-styling';

describe('agentStyleFor', () => {
  it('is deterministic — same seed -> same colors', () => {
    expect(agentStyleFor('planner')).toEqual(agentStyleFor('planner'));
  });

  it('different seeds usually get different colors (palette is small so allow a few collisions)', () => {
    const seen = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      seen.add(agentStyleFor(seed).labelColor);
    }
    // 8 unique colors, 10 seeds -> we expect most to be unique.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('labelColor is a valid 6-digit hex CSS color', () => {
    const c = agentStyleFor('test').labelColor;
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('exposes numeric body/accent/halo channels for PixiJS', () => {
    const s = agentStyleFor('test');
    expect(Number.isInteger(s.body)).toBe(true);
    expect(Number.isInteger(s.accent)).toBe(true);
    expect(Number.isInteger(s.halo)).toBe(true);
    expect(s.body).toBeGreaterThanOrEqual(0);
    expect(s.body).toBeLessThanOrEqual(0xffffff);
  });
});

describe('brightnessFor', () => {
  it('idle is the dimmest', () => {
    expect(brightnessFor('idle')).toBeLessThan(brightnessFor('thinking'));
    expect(brightnessFor('idle')).toBeLessThan(brightnessFor('working'));
  });

  it('working is the brightest', () => {
    expect(brightnessFor('working')).toBeGreaterThanOrEqual(brightnessFor('thinking'));
    expect(brightnessFor('working')).toBeGreaterThanOrEqual(brightnessFor('done'));
  });

  it('returns values in [0, 1]', () => {
    for (const s of ['idle', 'thinking', 'working', 'done'] as const) {
      const b = brightnessFor(s);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});
