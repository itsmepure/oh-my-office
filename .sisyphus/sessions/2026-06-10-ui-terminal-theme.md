# Session Handoff — 2026-06-10 (UI Redesign: Terminal Theme)

## Posisi Sekarang (di mana kita)

Lagi **redesign UI semua halaman** ke tema **TERMINAL (flat + boxy)**. MVP fungsional (Phase 0-10) SUDAH SELESAI sebelumnya — ini murni kerja styling/visual.

### Bahan desain dari user (sudah dicerna, JANGAN tanya ulang)
- **2 wireframe denah** (low-fi, sudah dipahami):
  1. **Home dashboard** (setelah login): header (logo+nama | menu bar | avatar) → stats full-width → office list (grid kartu)
  2. **Office page**: header → (pixel office ~70% | live activity feed ~30%) → terminal task full-width → (agent list | task history)
- **Tema**: TERMINAL — **FLAT + BOXY**. Biru gelap + accent kuning/amber. Palet dari referensi "Hermes Achievements" dashboard.
- **Font**: Geist (Vercel) — sudah terinstall + terpasang.
- **Skill referensi**: github.com/nextlevelbuilder/ui-ux-pro-max-skill (prinsip: ikon SVG bukan emoji, cursor-pointer, hover transition 150-300ms, focus state, kontras AA, no AI purple/pink gradient).
- **Referensi kualitas**: http://127.0.0.1:9119/achievements (dashboard Hermes — sidebar, hairline border, label uppercase letter-spaced, hierarki angka besar/label kecil).

### KOREKSI TERAKHIR user (PENTING — lagi dikerjakan)
User minta **benar-benar flat terminal**: "kenapa ada edge harusnya kotak-kotak. flat design terminal."
Artinya: **sudut TAJAM semua (no rounded), no gradient, no glow, no shadow, no glassy**. Depth hanya dari border 1px + step warna surface.

## Yang SUDAH dikerjakan
1. Geist font: `apps/web/src/app/layout.tsx` (GeistSans+GeistMono variable), `package.json` ada `geist`.
2. Theme tokens: `apps/web/src/app/globals.css` — SUDAH diubah ke FLAT (solid fill, no gradient/glow/shadow, `.card` = bg-surface + 1px border, `.eyebrow` = uppercase mono letter-spaced). Palette: --bg #0b0d14, --surface #11141f, --surface-2 #181c2b, --border #2a3050, --accent #e0a33e, --text #eceef6, --text-muted #9aa1bd, --text-faint #6b7193.
3. `apps/web/tailwind.config.ts` — semantic colors (bg, surface, surface-2→`bg-surface-2`, line, line-strong, accent/bright/dim, content/muted/faint, success, danger) + fontFamily sans/mono + **borderRadius SEMUA di-override ke '0'** (jadi semua rounded-* otomatis kotak).
4. Ikon SVG: `apps/web/src/components/icons.tsx` (Lucide-style, currentColor, 1.5 stroke).
5. Shared header: `apps/web/src/components/chrome/app-header.tsx` + `profile-menu.tsx` (logo > OpenOffice | menu Dashboard/Templates/Agents | avatar dropdown).
6. Semua halaman sudah dikonversi ke tema terminal: dashboard, login, signup, home, templates (+create form), agents (list/new/edit/form), offices/[id]/page.tsx (REDESIGN penuh per wireframe pakai komponen `Panel`), + semua child office (task-runner, activity-feed, task-history, manage-agents — sudah di-DE-NEST biar nggak double card), task detail, loading/error/not-found.
7. Office page pakai `Panel` wrapper (label header + divider) — children jadi plain content (bukan `<section className=card>` lagi).

## Gate terakhir (HIJAU)
typecheck 9/9, lint 8/8, build 5/5. (test 8/8 suites dari sesi sebelumnya.)

## SISA / NEXT (lanjut dari sini)
1. **Verifikasi flat di browser** — radius override + globals flat baru diterapkan, browser dicek dashboard: hampir semua kotak. SISA fix kecil:
   - Avatar "D" pojok kanan header sudah kotak (OK). Tapi pastikan avatar agent (P/C/R) & semua pill memang kotak setelah radius=0 (harusnya otomatis).
   - ("1 Issue" badge merah pojok = dev-only artifact PixiJS StrictMode, BUKAN bug, hilang di prod build.)
2. **Cek office page** dengan tema flat baru (belum di-screenshot setelah perubahan flat).
3. User = JURI visual final. Vision tool aux TIDAK RELIABLE buat nilai estetika — selalu minta user approve via screenshot.
4. Pixel office VISUAL masih PAUSED (posisi duduk + walk anim belum pas) — beda task, jangan dicampur.

## Cara resume cepat
1. `docker compose up -d postgres` (atau container openoffice-db sudah ada).
2. `cd /d/vibecoding/openoffice && pnpm dev` (web :3000 + orchestrator :3001).
3. Login: `demo@openoffice.local` / `demo1234`. Office demo: "Demo Dev Team" (office-demo-001).
4. PITFALL KRITIS: JANGAN `pnpm build/typecheck/test` (yang trigger build) sambil `pnpm dev` jalan → nimpa apps/web/.next → 500. Kill dev + `rm -rf apps/web/.next` dulu sebelum gate.
5. Browser flaky (Browserbase): login form → submit → kadap context detach ke about:blank. Pola: navigate /login, type, click, sleep, lalu navigate/snapshot ulang.

## File kunci
- apps/web/src/app/globals.css (tema FLAT)
- apps/web/tailwind.config.ts (radius=0, semantic colors)
- apps/web/src/app/layout.tsx (Geist)
- apps/web/src/components/icons.tsx, components/chrome/{app-header,profile-menu}.tsx
- apps/web/src/app/dashboard/page.tsx, offices/[id]/page.tsx (+ children)
