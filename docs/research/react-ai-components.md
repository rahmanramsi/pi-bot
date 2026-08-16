# Riset: Komponen React untuk AI — Pi Bot

> Tanggal riset: 2026-03 (verifikasi versi via npm registry & registry resmi)
> Scope: memetakan pilihan library/komponen React untuk membangun UI AI (chat + agent workspace),
> menilai kesesuaiannya dengan Pi Bot (aplikasi desktop macOS local-first untuk coding agent),
> dan merekomendasikan arah pengembangan.

---

## 1. Ringkasan eksekutif

- Pi Bot sudah berada di jalur yang tepat dan koheren: **semua lapisan AI UI-nya datang dari ekosistem Vercel** — `ai-elements` (registry komponen berbasis shadcn/ui), `streamdown` (rendering markdown streaming), plus `motion` untuk animasi.
- Model *source-owned* (kode disalin ke repo, bukan runtime dependency) memberi kendali penuh atas desain dan tidak menambah bundle.
- **Tidak perlu migrasi** ke framework chat penuh (Assistant UI, CopilotKit, Liveblocks). Framework tersebut menambah runtime/state layer, sebagian menuntut backend cloud, dan desainnya opiniated — bertentangan dengan sifat *local-first* Pi Bot.
- Peluang terbesar ada di **katalog ai-elements itu sendiri**: 48 komponen tersedia, baru 10 yang dipakai. Sejumlah komponen yang belum dipakai sangat relevan dengan "agent workspace" Pi Bot (plan, chain-of-thought, file-tree, suggestion, confirmation, dll).

---

## 2. Konteks project

| Faktor | Kondisi Pi Bot |
| --- | --- |
| Bentuk aplikasi | Aplikasi desktop **macOS (Electron)**, local-first, tanpa backend cloud |
| Inti produk | Workspace untuk Pi coding agent (`@earendil-works/pi-coding-agent`) |
| Transport data | **Electron IPC**, bukan HTTP/SSE streaming ke cloud |
| Konten yang dirender | Markdown streaming, kode (shiki), math, mermaid, teks CJK, output terminal (ANSI) |
| Design system | Radix UI + shadcn-style (`src/components/ui`), kontrak motion di `DESIGN.md` |
| Framework | React 19.2, Vite 8, Tailwind 4 |
| QA | Vitest + jsdom, tes streaming/motion di `scripts/qa` |

---

## 3. Kondisi saat ini (AI UI stack yang terpasang)

| Paket | Versi terpasang | Peran |
| --- | --- | --- |
| `ai-elements` (registry) | 1.9.0 (latest) | Sumber komponen AI; kode disalin & diadaptasi ke `src/components/ai-elements` |
| `streamdown` | 2.5.0 | Pengganti react-markdown untuk streaming AI |
| `@streamdown/cjk` `code` `math` `mermaid` | ^1.x | Plugin markdown: CJK, kode, math, mermaid |
| `motion` | 13.1.0 | Animasi (dibatasi lewat `src/lib/motion.tsx`) |
| `use-stick-to-bottom` | 1.1.6 | Auto-scroll percakapan |
| `ansi-to-react` | 6.2.6 | Output terminal ANSI |
| `shiki` | 3.23.0 | Syntax highlighting kode |

**Komponen AI yang sudah diadaptasi** (`src/components/ai-elements`, 10 file):

- `conversation` — wadah chat + scroll (StickToBottom)
- `message` — pesan user/assistant + `MessageResponse` (streamdown) + aksi
- `prompt-input` — form input + textarea + tombol submit/stop
- `tool` — collapsible pemanggilan tool (running/completed/failed)
- `code-block` — blok kode dengan highlight
- `task` — collapsible task
- `context` — indikator penggunaan context window (token)
- `reasoning` — kolaps "Thinking…" dengan durasi & auto-close
- `shimmer` — placeholder saat streaming
- `terminal` — output terminal ANSI dengan copy/clear

Catatan: komponen di atas telah **diadaptasi** ke kontrak lokal (Electron/IPC, design system, motion contract) dan diuji di `scripts/qa/ai-elements-renderer.test.tsx` — bukan salinan mentah dari registry.

---

## 4. Peta ekosistem React AI components

### 4.1 Registry komponen (source-owned, tanpa runtime dep)

**AI Elements (Vercel) — yang sedang dipakai**
- CLI `npx ai-elements@latest add <component>`; registry di `elements.ai-sdk.dev`; license Apache-2.0.
- Dibangun di atas **shadcn/ui** — persis basis design system Pi Bot.
- 48 file komponen (lihat §6). Memakai `ai`, `streamdown`, `motion`, `use-stick-to-bottom`, `shiki`, dll — **semuanya sudah ada di Pi Bot**.
- Kekuatan: kode milik sendiri, konsisten dengan UI yang ada, cepat diadaptasi.
- Kelemahan: kode perlu dirawat manual saat upgrade (bukan npm dep); banyak komponen dirancang dengan asumsi Next.js + AI SDK HTTP stream (mis. `artifact`, `sandbox`, `web-preview` memakai state `useChat`-ish).

**shadcn/ui blocks (chat templates)**
- shadcn sudah menjadi dasar Pi Bot. Tersedia template/block gaya ChatGPT, tapi saat riset ini **belum ada komponen chat baku di registry shadcn new-york** (pengecekan 2026-03 → 404 untuk `/docs/components/chat`).
- Praktiknya komunitas memakai ai-elements atau Assistant UI untuk kebutuhan ini.

### 4.2 Framework chat (runtime dependency)

| Library | Versi latest | Karakter | Kesesuaian Pi Bot |
| --- | --- | --- | --- |
| **Vercel AI SDK** (`ai` + `@ai-sdk/react`) | ai@7.0.66, @ai-sdk/react@4.0.69 | Hook `useChat`, protocol stream, message parts. **Basis dari ai-elements.** | 🔶 Sebagian. State chat & protocol stream dirancang untuk HTTP. Pi Bot komunikasi via IPC, jadi hanya pola (mis. message parts) yang bisa diadopsi, bukan paketnya langsung. |
| **Assistant UI** (`@assistant-ui/react`) | 0.15.14 | Headless chat runtime + primitives (Thread/Message), untuk "production-grade chat". | 🔶 Kuat secara runtime, tapi menambah state layer sendiri & desain opiniated; menyulitkan model timeline/agent milik Pi Bot. |
| **CopilotKit** (`@copilotkit/react-ui`) | 1.68.1 | Framework copilot lengkap (in-app agents, autogenerated UI, tool orchestration). | 🔴 Berat, cloud/backend-oriented, banyak magic yang sulit disesuaikan dengan kontrak lokal Pi Bot. |
| **Liveblocks AI** (`@liveblocks/react-ui`) | 3.24.0 | Komponen AI + kolaborasi real-time. | 🔴 Butuh infrastruktur Liveblocks cloud; bertentangan dengan local-first. |
| **botframework-webchat** | 4.19.1 | Web chat client untuk Azure Bot Services. | 🔴 Terikat Azure; bundle besar; bukan untuk agent tool-calling timeline. |

### 4.3 Library komponen AIGC umum

- **`@lobehub/ui`** (5.31.0) — library komponen AIGC (markdown, chat, plugin) milik LobeChat. Kuat tapi desainnya terikat identitas LobeChat dan bundle-nya besar; fungsionalitas sudah tercakup ai-elements + streamdown.
- **Radix UI / Base UI** — primitif headless; **sudah dipakai Pi Bot** (Radix). Bukan pesaing, melainkan fondasi.

---

## 5. Perbandingan singkat

| Kriteria | ai-elements (saat ini) | Assistant UI | CopilotKit | Liveblocks | LobeHub UI |
| --- | --- | --- | --- | --- | --- |
| Model instalasi | Source-owned (salin kode) | Runtime dep | Runtime dep | Runtime dep + cloud | Runtime dep |
| Cocok local-first/desktop | ✅ Sangat | ⚠️ Netral | ❌ Cloud | ❌ Cloud | ⚠️ Netral |
| Fit dengan design system Pi Bot | ✅ (berbasis shadcn) | ⚠️ Opiniated | ❌ Opiniated | ⚠️ | ❌ Identitas LobeChat |
| Komponen agent/timeline (tool, terminal, reasoning) | ✅ Ada | ⚠️ Fokus chat saja | 🔶 Ada tapi berantai ke runtime | ❌ | 🔶 Sebagian |
| Kontrol penuh / modifikasi | ✅ Kode lokal | 🔶 Melalui API runtime | 🔶 Melalui framework | 🔶 | 🔶 |
| Biaya upgrade/rawatan | Perlu merge manual | Ikut semver library | Ikut semver library | Ikut semver + cloud | Ikut semver library |
| Ketergantungan ekosistem | Vercel (ai/streamdown) — sudah dipakai | Sendiri | Sendiri | Sendiri | Sendiri |

**Kesimpulan perbandingan:** untuk Pi Bot, ai-elements menang di hampir semua kriteria relevan. Satu-satunya trade-off (rawatan manual saat upgrade) sudah terbayar oleh kendali penuh dan kesesuaian desain.

---

## 6. Katalog ai-elements: sudah dipakai vs belum

Dari registry resmi (`elements.ai-sdk.dev/api/registry/all.json`, 48 file komponen):

**Sudah diadaptasi (10):** conversation, message, prompt-input, tool, code-block, task, context, reasoning, shimmer, terminal.

**Belum dipakai (38)** — dikelompokkan berdasarkan relevansi dengan Pi Bot:

- **Sangat relevan untuk agent workspace** (pertimbangkan berikutnya):
  `plan` (daftar langkah agent), `chain-of-thought` (alur berpikir per langkah),
  `file-tree` (struktur file workspace), `suggestion` (saran prompt),
  `confirmation` (konfirmasi aksi berisiko), `commit` (info commit),
  `snippet`, `schema-display` (skema file/data), `stack-trace`,
  `test-results`, `environment-variables`, `package-info` (info package.json),
  `checkpoint` (restore state), `queue` (antrian task), `toolbar` (aksi kontekstual).
- **Sedang — butuh evaluasi desain:** `sources`, `inline-citation`, `agent` (kartu agent/model),
  `artifact`, `panel`, `controls`, `open-in-chat`, `persona`, `image`, `audio-player`, `transcription`.
- **Kurang relevan / asumsi Next.js+cloud:** `canvas`, `node`, `edge` (peta/graf — @xyflow),
  `sandbox`, `web-preview`, `jsx-preview`, `attachment`, `model-selector`, `mic-selector`,
  `voice-selector`, `speech-input`, `connection`.

> Catatan: komponen yang "kurang relevan" bukan berarti buruk, tapi dirancang dengan asumsi
> lingkungan Next.js + AI SDK HTTP streaming + backend — tidak langsung cocok dengan arsitektur
> Electron/IPC Pi Bot tanpa penyesuaian besar.

---

## 7. Analisis & implikasi untuk Pi Bot

1. **Arsitektur sudah selaras.** Semua layer AI UI berasal dari satu ekosistem (Vercel) dan
   mengikuti model shadcn (source-owned). Tidak ada duplikasi tanggung jawab antar library.
2. **Hindari framework chat penuh.** Runtime seperti Assistant UI/CopilotKit mengasumsikan
   state chat terpusat dan protocol sendiri; Pi Bot punya model timeline agent yang lebih kaya
   (tool call, terminal, reasoning, task) yang sudah dibangun di atas kontrak lokal.
3. **Gap yang nyata: state/streaming layer.** Pi Bot tidak memakai `useChat` dari AI SDK karena
   transport-nya IPC. Konsekuensinya logika streaming (append delta, batching markdown via
   streamdown) dirawat manual — ini sudah ditangani dan diuji, jadi bukan masalah mendesak.
4. **Pertumbuhan fitur paling murah lewat katalog ai-elements.** Komponen seperti `plan`,
   `file-tree`, `suggestion`, `confirmation` cocok dengan pola "agent workspace" dan bisa
   diadaptasi dengan pola yang sama seperti 10 komponen sebelumnya (ikut kontrak DESIGN.md).
5. **Perhatikan arah upstream.** ai-elements & streamdown aktif dirilis (1.9.0 rilis 2026-03).
   Karena source-owned, upgrade = merge ulang kode + cek tes `scripts/qa`. Buat kebiasaan
   mencatat versi di `ai-elements/README.md` (sudah dilakukan) dan menjalankan
   `npm run test:motion` setelah tiap sinkron.

---

## 8. Rekomendasi

**Jangka pendek (tanpa migrasi):**
1. Tetap pakai pendekatan ai-elements + adaptasi lokal.
2. Evaluasi adopsi komponen baru yang relevan, urutkan dari yang berdampak tinggi &
   berisiko rendah: `plan` → `chain-of-thought` → `suggestion` → `file-tree` → `confirmation`.
3. Pantau rilis baru ai-elements (1.9.x/2.x) & streamdown untuk perbaikan streaming.

**Jangka menengah:**
4. Jika kebutuhan state chat naik (mis. multi-turn resume, checkpoint), pinjam **pola**
   message-parts dari AI SDK daripada menarik runtime `@ai-sdk/react`.
5. Jangan adopsi CopilotKit/Liveblocks kecuali ada kebutuhan backend terpusat — yang
   bertentangan dengan posisi local-first Pi Bot.

**Jangka panjang:**
6. Jika ada fitur kolaborasi/graf agent (DAG), baru pertimbangkan `@xyflow/react`
   (dipakai komponen `node`/`edge`/`canvas` ai-elements) secara terpisah.

---

## 9. Referensi (diverifikasi saat riset)

- AI Elements registry & CLI: `elements.ai-sdk.dev`, `github.com/vercel/ai-elements`, `npm view ai-elements` → 1.9.0, Apache-2.0, maintainer Vercel.
- Katalog 48 komponen: `elements.ai-sdk.dev/api/registry/all.json`.
- streamdown: `github.com/vercel/streamdown` → "A drop-in replacement for react-markdown, designed for AI-powered streaming" (2.5.0).
- Vercel AI SDK: `ai` 7.0.66, `@ai-sdk/react` 4.0.69.
- Assistant UI `@assistant-ui/react` 0.15.14; CopilotKit `@copilotkit/react-ui` 1.68.1 (peer React ^18||^19); Liveblocks `@liveblocks/react-ui` 3.24.0; botframework-webchat 4.19.1; `@lobehub/ui` 5.31.0.
- shadcn registry new-york: 363 item, belum ada komponen chat baku (pengecekan 2026-03).
