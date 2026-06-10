# Asset Links — Pixel Office Character Sprites

> Riset untuk OpenOffice pixel office. Background sudah ada (Greenview office,
> top-down ¾ / oblique, ~1248×1248). Yang dicari di sini: **CHARACTER sprite
> sheet** untuk agent — bukan tileset/furniture (background sudah punya).
>
> Kriteria wajib:
> - **Top-down / RPG perspektif** (BUKAN side-scroller/platformer) — harus match background ¾.
> - **Cocok setting office** (orang biasa berpakaian kasual/kantoran, bukan ksatria/zombie).
> - **PNG sprite sheet**, idealnya multi-arah (hadap bawah + atas; kursi office hadap beda-beda).
> - **Skala ~32px** (paling pas dengan furnitur di background Greenview).
> - **Animasi** idle/walk minimal; bonus kalau ada pose duduk/baca/aktivitas.
> - **Lisensi komersial** aman.

---

## #1 — REKOMENDASI UTAMA: LimeZu "Modern Interiors"

**Link:** https://limezu.itch.io/moderninteriors
**Harga:** Name-your-own-price (versi lengkap + Character Generator di tier berbayar; ada bundle 3-pack $5 saat Spring Sale).
**Lisensi:** Komersial OK (cek README pack).

**Kenapa ini paling cocok:**
- Background Greenview-mu **kemungkinan besar dibuat dari aset keluarga LimeZu ini** — style RPG top-down 16-bit "crisp minimal" yang **identik**. Karakter bakal nyambung sempurna, bukan nempel-asal.
- **Character Generator System**: rakit karakter dari komponen — 100+ outfit, 200 hairstyle, 80 aksesoris, 9 skin tone. Tiap agent (Planner/Coder/Reviewer + custom) bisa unik & deterministik → cocok dengan konsep hash-per-agent yang sudah ada di kode.
- Animasi: idle, run, + aksi (read-a-book, pick-up, lift, dll) → bisa di-map ke state kita (idle/thinking/working/done).
- Tersedia **3 ukuran: 16/32/48px** — pilih 32px.
- Top-down 4 arah → cocok untuk kursi office yang hadap beda-beda.

**Catatan:** Pack "Modern Office - Revamped" (https://limezu.itch.io/modernoffice, $2.50) itu **tileset furniture office** — buat BACKGROUND, bukan karakter. Kamu sudah punya background, jadi yang dibutuhkan untuk KARAKTER adalah **Modern Interiors** (atau Modern Exteriors untuk karakter generator-nya). Kalau mau aman + future-proof, beli yang ada Character Generator-nya.

---

## #2 — ALTERNATIF KUAT: shubibubi "Cozy People Asset Pack"

**Link:** https://shubibubi.itch.io/cozy-people
**Harga:** Pay-what-you-want, versi lengkap unlock di **$3.99+**. Bundle "all things cozy" (7 pack) $20.
**Rating:** 4.8/5 (64 rating). **No generative AI.**
**Lisensi:** Komersial & non-komersial OK di versi $3.99+ (tidak boleh dijual ulang).

**Kenapa cocok:**
- **Top-down**, layout **32×32** (sprite 20×16 di kanvas 32×32 untuk layering) — match skala background.
- **Customizable berlapis**: 13 hairstyle × 14 warna, baju 10 warna (**termasuk Suit + Pants** → bisa look kantoran), 5 skin tone, aksesoris (kacamata, jenggot, dll). Deterministik per-agent sangat mungkin.
- **BONUS BESAR: 15 "mood/think bubbles"** (Tired, Happy, Cool, Love, dll) — pas banget buat status agent (thinking/working/done) tanpa bikin sendiri.
- Greyscale included → recolor bebas.

**Kekurangan jujur:**
- **TIDAK ada idle animation** (cuma walk/carry/jump/dll) — ini keluhan #1 di komentar. Untuk agent yang "duduk diam", kita pakai 1 frame statis + bubble. OK untuk kebutuhan kita.
- Palette "cozy/muted" — agak beda nuansa dari Greenview yang lebih realistis. Masih bisa, tapi #1 (LimeZu) lebih nyambung.

---

## #3 — CADANGAN: GandalfHardcore "50+ Modern Pixel Art Characters - NPC Pack"

**Link:** https://gandalfhardcore.itch.io/pixel-art-npc-characters-pack
**Harga:** ~$9.74 (-35% saat dicek).
**Isi:** 63 karakter modern + 5–6 kendaraan, masing-masing dengan animasi sendiri.

**Kenapa masuk daftar:**
- Tema **modern** (orang kota/kantoran) — cocok setting office.
- Karakter siap-pakai (nggak perlu rakit) → cepat kalau mau langsung jalan.

**Yang HARUS dicek sebelum beli** (belum terkonfirmasi dari halaman):
- **Perspektif**: pastikan top-down, bukan side-view. (Beberapa pack "modern character" itu side-scroller.) Lihat preview GIF di halaman sebelum bayar.
- Susunan sheet & ukuran frame.

---

## DICORET (tidak cocok)

- **CraftPix "City Man" Sprite Sheets** (https://craftpix.net/freebies/city-man-pixel-art-character-sprite-sheets/) — GRATIS & tema kantoran (businessman, suit), TAPI animasinya **Idle/Walk/Run/Attack/Hurt/Dead** = ini **side-scroller/platformer**, BUKAN top-down. Tidak match background. Skip.

---

## REKOMENDASI AKHIR

1. **Beli `LimeZu — Modern Interiors`** (#1). Paling nyambung secara visual dengan background Greenview, plus Character Generator untuk variasi agent tak terbatas. Ambil ukuran **32×32**.
2. Kalau mau opsi lebih murah/sederhana + dapat **think-bubbles gratis**: **`shubibubi — Cozy People`** (#2), versi $3.99.

Untuk MVP (Dev Team: Planner/Coder/Reviewer = 3 agent), **salah satu** dari #1 atau #2 sudah lebih dari cukup.

---

## YANG AKU BUTUH DARI KAMU SETELAH BELI

Drop file ke `apps/web/public/pixel-office/characters/` lalu kasih tahu:
1. **Ukuran per frame** (mis. 32×32 — ada padding atau ngepas?)
2. **Susunan sheet** (mis. "tiap baris = 1 arah, tiap kolom = 1 frame walk"; atau ada file `.json` metadata)
3. **Animasi apa saja** yang tersedia (idle? walk? sit? read?)

Hal pertama yang aku lakukan: **inspeksi file aslinya** (ukuran, transparansi, susunan frame) sebelum nulis kode wiring — biar nggak salah asumsi. Engine pixel office (state reducer, event flow) sudah solid; tinggal ganti sumber visual dari prosedural → sprite sheet beneran + mapping state→animasi + tempatkan di slot meja yang match background.

---

*Disusun: 2026-06-10. Semua harga & diskon per tanggal cek; bisa berubah.*

---

## STATUS KODE SAAT INI (penting, baca pas balik)

### BACKGROUND sudah masuk ✓
- File: `apps/web/public/pixel-office/office-bg.png` — **1642×958 PNG**, interior
  office full, top-down ¾, tema dev startup (poster "BUILD/SHIP/LAUNCH/REPEAT",
  whiteboard "Q2 GOALS"). Landscape, full ruangan (no transparan, ada vignette tepi).
- **4 workstation jelas** untuk agent: 2 kluster kiri-tengah + 2 kanan-tengah,
  tiap stasiun ada dual-monitor + kursi. **Semua kursi hadap ATAS (konsisten)** →
  karakter duduk membelakangi kamera, seragam. Gampang di-wire.
- Buat Dev Team (3 agent) → pakai 3 dari 4 slot itu.
- Bonus slot: meja meeting kanan (~8 kursi, arah campur) buat scene grup; lounge
  kiri-bawah buat pose santai. Tidak dipakai dulu di MVP.
- TODO wiring: koordinat 4 slot di-overlay di browser + verifikasi bareng user.



- Pixel office di kode **masih versi prosedural ¾** yang kita sepakat kurang bagus
  (sprite-canvas.ts 48px + room ¾). Aku **sengaja TIDAK revert** — begitu asset
  itch.io masuk, `sprite-canvas.ts` ditulis ulang total pakai sprite beneran,
  jadi revert sekarang = kerja sia-sia.
- Engine yang ASLI penting (state reducer, event flow, store, slot layout) **solid
  dan tidak perlu diubah** — cuma sumber visual (gambar prosedural → sprite sheet)
  yang diganti.
- Gate sehat per cek terakhir: **typecheck 9/9, test 137 (8/8 suites)**. Proyek
  tidak ditinggal dalam keadaan rusak.
- Dev server kemungkinan masih jalan (web :3000, orchestrator :3001) dari sesi
  recheck. Kalau mau matikan: kill PID di port 3000/3001 lalu `rm -rf apps/web/.next`.
- Begitu beli asset → drop ke `apps/web/public/pixel-office/characters/` →
  kabari aku ukuran frame + susunan sheet. Aku inspeksi file dulu sebelum wiring.

