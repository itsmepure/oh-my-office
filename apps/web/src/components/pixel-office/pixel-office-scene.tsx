'use client';

// PixiJS v8 scene — client-only. Office background image + one character per
// OfficeAgent with a small behavior system:
//   - ACTIVE (working/thinking/done): the agent occupies its desk and sits
//     STILL (working = typing animation, otherwise a static seated frame).
//   - IDLE: the agent ROAMS the floor — walks between random waypoints with
//     directional walk animations, pausing to rest, sometimes by the lounge.
// State comes from the Zustand realtime store (orchestrator events).

import { useEffect, useMemo, useRef } from 'react';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import { useRealtimeStore } from '@/lib/realtime-store';
import { reduceEventsToAgentStates, type AgentVisualState } from './event-to-state';
import { CLIPS, type ClipName, FRAME_H, FRAME_W, OFFICE_BG_URL, sheetUrlFor } from './sprite-canvas';
import { agentStyleFor } from './sprite-styling';

export interface PixelAgentSpec {
  ref: string;
  name: string;
  role: string;
}

export interface PixelOfficeSceneProps {
  agents: PixelAgentSpec[];
  width?: number;
  height?: number;
}

// ── Tunable layout (fractions of the 1642×958 background) ───────────────────

/** Desk chair centers — where an active agent sits. */
const DESK_SLOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 325 / 1642, y: 405 / 958 },
  { x: 560 / 1642, y: 405 / 958 },
  { x: 825 / 1642, y: 405 / 958 },
  { x: 1020 / 1642, y: 405 / 958 },
];

/** Open-floor waypoints for idle roaming. Auto-detected on the wood floor +
 * verified clear of furniture (1642×958 background coords). */
const ROAM_WAYPOINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 220 / 1642, y: 480 / 958 },
  { x: 540 / 1642, y: 480 / 958 },
  { x: 620 / 1642, y: 690 / 958 },
  { x: 700 / 1642, y: 480 / 958 },
  { x: 780 / 1642, y: 630 / 958 },
  { x: 780 / 1642, y: 780 / 958 },
];

const CHAR_H_FRAC = 0.16;     // on-screen char height / canvas height
const SPRITE_ANCHOR_Y = 0.9;  // verified via offline composite (waist at desk edge)
const WALK_SPEED_FRAC = 0.06; // canvas-heights per second while roaming
const REST_MIN = 1.5;         // seconds resting at a waypoint
const REST_MAX = 4.0;

/** Respect the OS reduced-motion setting (a11y, mandatory). When true we skip
 * the materializing enter + halo easing and render final state immediately. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** ease-out-quint — strong deceleration, no overshoot (Jakub: production curve). */
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

function bubbleContent(state: AgentVisualState): string {
  switch (state) {
    case 'thinking': return '?';
    case 'working': return '...';
    case 'done': return 'OK';
    case 'idle': return '';
  }
}

function tintFor(state: AgentVisualState): number {
  switch (state) {
    case 'idle': return 0xdfe3ec;
    case 'thinking': return 0xfff2d4;
    case 'working': return 0xffffff;
    case 'done': return 0xcfe0ff;
  }
}

const HALO_ALPHA: Record<AgentVisualState, number> = {
  idle: 0, thinking: 0.4, working: 0.6, done: 0.3,
};

/** Walk clip for a movement vector (dominant axis decides facing). */
function walkClip(dx: number, dy: number): ClipName {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'walkLeft' : 'walkRight';
  return dy < 0 ? 'walkUp' : 'walkDown';
}

type Mode = 'desk' | 'roam';

interface AgentObj {
  ref: string;
  container: Container;
  halo: Graphics;
  sprite: Sprite;
  bubble: Container;
  clips: Record<ClipName, Texture[]>;
  // current animation
  clip: ClipName;
  frameIdx: number;
  frameTimer: number;
  // position (canvas px) + roaming
  x: number;
  y: number;
  deskX: number;
  deskY: number;
  target: { x: number; y: number };
  restTimer: number;
  mode: Mode;
  state: AgentVisualState;
  appliedState?: AgentVisualState;
  phase: number;
  // motion polish
  haloAlpha: number;     // current (lerped) halo alpha
  haloTarget: number;    // target halo alpha for current state
  enterT: number;        // 0→1 materializing-enter progress
  enterDelay: number;    // stagger before this agent's enter begins (s)
}

async function loadPixelTexture(url: string): Promise<Texture> {
  const tex = await Assets.load<Texture>(url);
  tex.source.scaleMode = 'nearest';
  return tex;
}

function sliceClip(source: Texture['source'], clip: { row: number; start: number; frames: number }): Texture[] {
  const out: Texture[] = [];
  for (let i = 0; i < clip.frames; i += 1) {
    out.push(new Texture({
      source,
      frame: new Rectangle((clip.start + i) * FRAME_W, clip.row * FRAME_H, FRAME_W, FRAME_H),
    }));
  }
  return out;
}

function sliceAllClips(source: Texture['source']): Record<ClipName, Texture[]> {
  const map = {} as Record<ClipName, Texture[]>;
  (Object.keys(CLIPS) as ClipName[]).forEach((name) => {
    map[name] = sliceClip(source, CLIPS[name]);
  });
  return map;
}

export function PixelOfficeScene({ agents, width = 720, height = 420 }: PixelOfficeSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const lastSnapshotRef = useRef<string>('');

  const specs = useMemo(() => agents.slice(), [agents]);

  useEffect(() => {
    let disposed = false;
    const host = containerRef.current;
    if (!host) return;

    const app = new Application();
    appRef.current = app;

    void (async () => {
      try {
        await app.init({ width, height, background: 0x1a1f2c, antialias: false, resolution: 1, preserveDrawingBuffer: true });
      } catch (err) {
        console.error('[pixel-office] PixiJS init failed', err);
        return;
      }
      if (disposed) { app.destroy(true, { children: true }); return; }

      const root = new Container();
      root.sortableChildren = true;
      app.stage.addChild(root);

      // ── Background ──
      try {
        const bgTex = await loadPixelTexture(OFFICE_BG_URL);
        if (disposed) { app.destroy(true, { children: true }); return; }
        const bg = new Sprite(bgTex);
        bg.width = width;
        bg.height = height;
        bg.zIndex = -1;
        root.addChild(bg);
      } catch (err) {
        console.error('[pixel-office] background load failed', err);
      }

      const charScale = (height * CHAR_H_FRAC) / FRAME_H;
      const wp = (p: { x: number; y: number }) => ({ x: p.x * width, y: p.y * height });

      const objs: AgentObj[] = [];
      for (let i = 0; i < specs.length; i += 1) {
        const spec = specs[i]!;
        const desk = wp(DESK_SLOTS[i] ?? { x: 0.5, y: 0.45 });

        const container = new Container();
        container.x = desk.x;
        container.y = desk.y;
        root.addChild(container);

        const halo = new Graphics();
        halo.alpha = 0;
        container.addChild(halo);

        let clips: Record<ClipName, Texture[]>;
        try {
          const sheet = await loadPixelTexture(sheetUrlFor(spec.role, spec.ref));
          if (disposed) { app.destroy(true, { children: true }); return; }
          clips = sliceAllClips(sheet.source);
        } catch {
          const w = [Texture.WHITE];
          clips = { sitStill: w, workType: w, walkDown: w, walkUp: w, walkLeft: w, walkRight: w, standDown: w };
        }
        const sprite = new Sprite(clips.sitStill[0]);
        sprite.anchor.set(0.5, SPRITE_ANCHOR_Y);
        sprite.scale.set(charScale, charScale);
        container.addChild(sprite);

        const label = new Text({
          text: spec.name,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '600', fill: 0xffffff, align: 'center' },
        });
        label.anchor.set(0.5, 0);
        label.y = FRAME_H * charScale * 0.18 + 6;
        const lw = Math.ceil(label.width) + 12;
        const plate = new Graphics();
        plate.roundRect(-lw / 2, label.y - 2, lw, 17, 5).fill({ color: 0x161b26, alpha: 0.8 });
        container.addChild(plate);
        container.addChild(label);

        const bubble = new Container();
        bubble.y = -FRAME_H * charScale * 0.62;
        container.addChild(bubble);

        objs.push({
          ref: spec.ref, container, halo, sprite, bubble, clips,
          clip: 'sitStill', frameIdx: 0, frameTimer: 0,
          x: desk.x, y: desk.y, deskX: desk.x, deskY: desk.y,
          target: wp(ROAM_WAYPOINTS[i % ROAM_WAYPOINTS.length]!),
          restTimer: 0, mode: 'desk', state: 'idle', phase: (i * 1.7) % (Math.PI * 2),
          haloAlpha: 0, haloTarget: 0,
          enterT: PREFERS_REDUCED_MOTION ? 1 : 0,
          enterDelay: PREFERS_REDUCED_MOTION ? 0 : i * 0.12,
        });
        // Materializing enter: start slightly small + transparent (skipped when
        // reduced-motion). 0.9 floor, never scale(0) — see creation-gotchas.
        if (!PREFERS_REDUCED_MOTION) {
          container.alpha = 0;
          container.scale.set(0.92);
        }
      }

      host.appendChild(app.canvas);

      const setClip = (o: AgentObj, clip: ClipName) => {
        if (o.clip === clip) return;
        o.clip = clip;
        o.frameIdx = 0;
        o.frameTimer = 0;
        o.sprite.texture = o.clips[clip][0]!;
      };

      const applyVisual = (o: AgentObj) => {
        if (o.appliedState === o.state) return;
        o.appliedState = o.state;
        o.sprite.tint = tintFor(o.state);
        const style = agentStyleFor(o.ref);
        // Draw the halo once at full color; animate its visibility via halo.alpha
        // (lerped in the tick) so state changes fade smoothly, not snap.
        o.halo.clear();
        o.halo.ellipse(0, 0, FRAME_W * 1.6, FRAME_H * 0.55).fill({ color: style.halo, alpha: 1 });
        o.haloTarget = HALO_ALPHA[o.state];
        if (PREFERS_REDUCED_MOTION) { o.haloAlpha = o.haloTarget; o.halo.alpha = o.haloTarget; }
        o.bubble.removeChildren();
        const glyph = bubbleContent(o.state);
        if (glyph) {
          const bg = new Graphics();
          bg.roundRect(-13, -9, 26, 18, 5).fill(0x161b26).stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
          const t = new Text({ text: glyph, style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: 0xffffff } });
          t.anchor.set(0.5, 0.5);
          o.bubble.addChild(bg, t);
        }
      };

      const paint = () => {
        const events = useRealtimeStore.getState().records.map((r) => r.event);
        const snap = reduceEventsToAgentStates(events, objs.map((o) => o.ref));
        const key = JSON.stringify(snap.byAgent);
        if (key === lastSnapshotRef.current) return;
        lastSnapshotRef.current = key;
        for (const o of objs) o.state = snap.byAgent[o.ref] ?? 'idle';
      };
      paint();
      unsubRef.current = useRealtimeStore.subscribe(paint);

      const speed = height * WALK_SPEED_FRAC;
      const ARRIVE = 4; // px

      const tick = (ticker: Ticker) => {
        const dt = ticker.deltaMS / 1000;
        const now = performance.now();
        for (const o of objs) {
          applyVisual(o);
          const active = o.state !== 'idle';

          if (active) {
            // Head to desk, then sit still.
            o.mode = 'desk';
            const dx = o.deskX - o.x;
            const dy = o.deskY - o.y;
            const dist = Math.hypot(dx, dy);
            if (dist > ARRIVE) {
              const step = Math.min(dist, speed * dt);
              o.x += (dx / dist) * step;
              o.y += (dy / dist) * step;
              setClip(o, walkClip(dx, dy));
            } else {
              o.x = o.deskX;
              o.y = o.deskY;
              // Seated: working types; thinking/done sit still.
              setClip(o, o.state === 'working' ? 'workType' : 'sitStill');
            }
          } else {
            // Roam: walk to target, rest, pick a new waypoint.
            o.mode = 'roam';
            if (o.restTimer > 0) {
              o.restTimer -= dt;
              setClip(o, 'standDown');
            } else {
              const dx = o.target.x - o.x;
              const dy = o.target.y - o.y;
              const dist = Math.hypot(dx, dy);
              if (dist > ARRIVE) {
                const step = Math.min(dist, speed * dt);
                o.x += (dx / dist) * step;
                o.y += (dy / dist) * step;
                setClip(o, walkClip(dx, dy));
              } else {
                o.restTimer = REST_MIN + Math.random() * (REST_MAX - REST_MIN);
                const next = ROAM_WAYPOINTS[Math.floor(Math.random() * ROAM_WAYPOINTS.length)]!;
                o.target = { x: next.x * width, y: next.y * height };
              }
            }
          }

          // Advance animation frames.
          const frames = o.clips[o.clip];
          if (frames.length > 1) {
            o.frameTimer += dt;
            const spf = 1 / CLIPS[o.clip].fps;
            if (o.frameTimer >= spf) {
              o.frameTimer -= spf;
              o.frameIdx = (o.frameIdx + 1) % frames.length;
              o.sprite.texture = frames[o.frameIdx]!;
            }
          }

          // Seated agents stay perfectly still; roaming/walking get no extra bob
          // (the walk cycle already conveys motion). Resting idle gets a tiny
          // breathing sway so they don't look frozen.
          const breathe = (o.mode === 'roam' && o.restTimer > 0) ? Math.sin(now / 520 + o.phase) * 0.6 : 0;
          o.container.x = o.x;
          o.container.y = o.y + breathe;
          // Painter's algorithm: agents lower on screen (larger y) draw in
          // front, so overlapping sprites never permanently bury each other.
          o.container.zIndex = o.y;

          // Halo: ease current alpha toward target so state changes fade in/out
          // smoothly (Jakub: no snap). Frame-rate-independent lerp.
          if (o.haloAlpha !== o.haloTarget) {
            const k = 1 - Math.exp(-dt * 9);
            o.haloAlpha += (o.haloTarget - o.haloAlpha) * k;
            if (Math.abs(o.haloTarget - o.haloAlpha) < 0.004) o.haloAlpha = o.haloTarget;
            o.halo.alpha = o.haloAlpha;
          }

          // Materializing enter: staggered fade + scale-up on first mount, using
          // ease-out-quint. Skipped entirely under reduced-motion (enterT starts 1).
          if (o.enterT < 1) {
            if (o.enterDelay > 0) {
              o.enterDelay -= dt;
            } else {
              o.enterT = Math.min(1, o.enterT + dt / 0.45); // 450ms enter
              const e = easeOutQuint(o.enterT);
              o.container.alpha = e;
              o.container.scale.set(0.92 + 0.08 * e);
            }
          }
        }
      };
      app.ticker.add(tick);
    })();

    return () => {
      disposed = true;
      lastSnapshotRef.current = '';
      if (unsubRef.current) { try { unsubRef.current(); } catch { /* ignore */ } unsubRef.current = null; }
      try { app.destroy(true, { children: true, texture: true }); } catch { /* HMR teardown race */ }
      appRef.current = null;
    };
  }, [width, height, specs]);

  return (
    <div
      ref={containerRef}
      data-testid="pixel-office-scene"
      style={{
        width, height, borderRadius: 12, overflow: 'hidden',
        background: '#1a1f2c', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    />
  );
}
