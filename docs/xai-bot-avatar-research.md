# Riset avatar ala xAI Bot untuk Pi Bot

Tanggal riset: 2026-08-14

Status implementasi: riset/proposal. Avatar SVG animasi belum diterapkan. Implementasi saat ini tetap memakai inisial dan warna deterministik yang sama di agent rail, chat, working state, dan settings. Kontrak avatar yang sudah berlaku didokumentasikan di [design-system.md](design-system.md).

## Jawaban singkat

Buat **avatar identitas berbasis SVG yang orisinal**, lalu beri gerak kecil yang merefleksikan state (`idle`, `working`, `needs-attention`, `error`). Ini selaras dengan pola yang benar-benar terlihat pada Grok Bot: mark avatar adalah SVG yang menukar state ekspresi/eye transform, bukan model 3D atau canvas. Untuk Pi Bot, ini cukup dilakukan di komponen `AgentAvatar` yang sudah dipakai pada rail, chat, dan settings—tanpa canvas, WebGL, video, atau paket animasi baru.

Ini menangkap kualitas yang biasanya dicari dari avatar agent modern: bentuk yang mudah diingat, hidup tetapi tidak mengalihkan perhatian, dan status yang bisa dipindai. Jangan menyalin logo, nama, screenshot, atau aset Grok/xAI.

## Batas bukti

### Fakta terverifikasi

- Halaman resmi [Grok Bot](https://x.ai/bot) menyebut Bot sebagai AI teammate yang dapat diberi pekerjaan, bekerja paralel, dan memiliki komputer sendiri.
- **Observasi DOM/screenshot browser pada 2026-08-14 di halaman resmi [Grok Bot](https://x.ai/bot):** avatar memakai elemen SVG `svg.grok-bot-mark`, bukan canvas atau model 3D. Mark hero berukuran 60 × 60 px dan memakai `viewBox="-15 -15 259 259"`. SVG tersebut memiliki satu path kepala serta dua path mata putih.
- Pada observasi yang sama, atribut `data-state` avatar terlihat berubah di antara `idle`, `happy`, `curious`, dan `notifying`; transform mata ikut berubah seiring waktu. Tint/warna mark juga bervariasi antar-agent. Ini adalah perilaku yang dapat terlihat pada surface resmi, bukan dokumentasi source code internal xAI.
- Halaman juga memuat canvas terpisah berukuran 173 × 32 px, tetapi canvas itu bukan avatar `grok-bot-mark`. Jadi bukti yang tersedia mendukung SVG/vector untuk avatar, bukan canvas.
- Dokumentasi enterprise xAI menyatakan `assets.grok.com` melayani **profile images** dan UI assets; jika host itu diblokir, avatar pengguna tidak akan termuat tetapi fungsi produk tidak terdampak ([Enterprise networking](https://docs.x.ai/build/enterprise)). Ini menegaskan avatar adalah aset presentasi terpisah dari fungsi agent.
- Dokumentasi resmi xAI yang dapat diakses tidak menjelaskan format aset, source code, state machine, frame rate, atau perilaku animasi avatar Grok Bot. FAQ hanya mendeskripsikan persona/conversational style, bukan teknologi avatar ([Grok FAQ](https://x.ai/legal/faq)).
- Pengambilan HTTP tanpa browser dari `https://x.ai/bot` menerima Cloudflare `403`, sehingga source bundle/CSS dan implementasi internal tetap tidak dapat diaudit dari lingkungan ini. Observasi browser di atas cukup untuk menyatakan bentuk, elemen SVG, state yang terlihat, dan prinsip animasinya—tetapi tidak cukup untuk mengklaim source code atau arsitektur internal xAI.

### Inferensi yang aman

Pola yang dapat ditiru secara bertanggung jawab adalah **avatar SVG kecil** sebagai anchor identitas agent, dengan gerak mata/elemen internal yang halus dan berarti state. Bentuk, palet, motion curve, `viewBox`, path, class name, dan aset Pi Bot harus dibuat sendiri. Ini berbeda dengan menyalin trade dress atau aset xAI/Grok.

## Posisi Pi Bot saat ini

Pi Bot sudah memiliki titik integrasi yang sangat kecil:

- `AgentAvatar` di [`src/App.tsx`](../src/App.tsx) menghasilkan lingkaran berisi inisial dari `agent.id`.
- Avatar itu dipakai di rail, message agent, working state, dan settings; CSS ukurannya sudah responsif menurut konteks: 28 px chat, 38 px rail, dan 40 px settings ([`src/styles.css`](../src/styles.css)).
- `AgentProfile` belum menyimpan file avatar; ia sudah memiliki `id`, `name`, dan `initials` ([`src/types.ts`](../src/types.ts)).

Kesimpulannya: gunakan `id` sebagai seed visual deterministik. Tidak perlu menambahkan upload avatar, storage, fallback, atau migrasi data untuk tahap pertama.

## Arah visual yang disarankan

Pilih satu **glyph abstrak** milik Pi Bot, bukan wajah, maskot, atau logo pihak lain. xAI menunjukkan bahwa animasi ekspresi dapat dilakukan cukup dengan paths SVG dan transform; Pi Bot tidak perlu meniru wajah atau mata mereka untuk memperoleh kualitas "hidup" yang sama. Contoh struktur yang mudah dibuat dan tetap khas:

```text
wadah bundar / squircle gelap
└─ 3 bentuk "kelopak" atau busur asimetris berwarna
   └─ titik inti kecil berwarna terang
```

- Gunakan 2–3 warna yang diturunkan dari hash `agent.id`, tetapi kunci luminance agar teks/status tetap terbaca.
- Buat variasi per role dari urutan warna, rotasi awal, atau jumlah kelopak—bukan dari aset gambar baru.
- Bentuk dasar harus tetap dikenali saat diam dan pada ukuran 28 px. Animasi hanya memberi rasa hidup, tidak boleh menjadi satu-satunya pembeda role atau status.
- Hindari bentuk bunga enam kelopak, huruf `G`, palet, nama, atau silhouette yang tampak seperti identitas Grok/xAI.

## Pilihan implementasi

| Opsi | Cara kerja | Kelebihan | Kekurangan | Keputusan |
| --- | --- | --- | --- | --- |
| **Inline SVG + CSS** | Satu SVG kecil dengan 3 path/group dan custom properties untuk warna/state. | Tajam pada semua DPI, dapat diwarna, tanpa dependency, sangat kecil. | Perlu menggambar glyph awal. | **Pilih ini.** |
| CSS-only orb | Beberapa elemen `div`/pseudo-element dengan gradient dan transform. | Sangat cepat dibuat. | Blur/gradient lebih sulit konsisten dan kurang mudah diekspor sebagai aset. | Layak untuk spike, bukan aset final. |
| Lottie/Rive | Aset animator diekspor dengan state machine. | Bagus bila motion designer sudah membuat karakter kompleks. | Runtime/aset lebih berat; perlu dependency dan QA state. | Pakai hanya bila kebutuhan motion benar-benar melampaui glyph. |
| Canvas/WebGL/Three.js | Menggambar partikel/3D real-time. | Efek visual paling kaya. | Boros GPU/CPU, sulit diakses, berlebihan untuk avatar 28–40 px. | Jangan pakai. |

## Rekomendasi minimal yang siap diimplementasikan

1. Pertahankan API `AgentAvatar` saat ini dan render SVG inline di dalamnya.
2. Turunkan tiga warna dari `agent.id`; gunakan nilai yang sudah dikendalikan, bukan warna acak saat render.
3. Terima prop `state: "idle" | "working" | "attention" | "error"` dengan default `idle`.
4. Beri class state pada elemen SVG. Hanya `working` yang bergerak terus; state lain berupa perubahan warna/ring yang statis atau satu transisi pendek.
5. Pasangkan state dengan teks yang sudah ada—misalnya `Working…`—di luar avatar. Avatar tetap `aria-hidden="true"` karena current state wajib disampaikan secara tekstual.

Kontrak visualnya dapat sekecil ini:

| State | Perubahan avatar | Informasi yang wajib tetap ada di teks |
| --- | --- | --- |
| `idle` | Diam, inti stabil. | Nama agent. |
| `working` | Rotasi/pulse lambat 2.4–3.2 detik. | “Agent is working”, bukan hanya warna/gerak. |
| `attention` | Ring amber statis atau pulse tunggal saat state masuk. | “Needs input”/pertanyaan yang membutuhkan respons. |
| `error` | Ring merah statis. | Pesan error dan tindakan recovery. |

Jangan mengubah ukuran layout sesuai state. Avatar yang bergerak harus memakai `transform`/`opacity` terhadap elemen internal saja agar rail dan transcript tidak reflow.

## Pipeline aset dan motion

### Tahap 1: desain master

1. Buat glyph orisinal dalam `viewBox="0 0 64 64"` di Figma, Illustrator, atau SVG editor.
2. Uji dulu pada 28 px, 38 px, dan 40 px—ukuran nyata Pi Bot—dengan dark dan light theme.
3. Pastikan masih terbaca dengan satu warna/grayscale; jika tidak, silhouette belum cukup kuat.

### Tahap 2: produksi SVG

1. Ubah stroke yang kompleks menjadi path bila perlu agar tampil sama di Chromium/Electron.
2. Hilangkan metadata/editor markup dan optimalkan dengan SVGO dalam CI atau langkah build.
3. Untuk avatar berbasis data seperti Pi Bot, pilih inline React SVG. Untuk artwork statis khusus per agent, simpan SVG di `public/avatars/` dan gunakan nama berlisensi milik sendiri.
4. Jangan membuat PNG sebagai aset utama. SVG tidak memerlukan varian 2x/3x untuk layar retina dan bisa diwarna via CSS variables.

### Tahap 3: motion

Gunakan paling banyak dua keyframe sederhana:

```css
@keyframes avatar-drift {
  50% { transform: rotate(7deg) scale(1.035); }
}

.agent-avatar[data-state="working"] .avatar-petal-group {
  animation: avatar-drift 2.8s ease-in-out infinite;
  transform-origin: 32px 32px;
}

@media (prefers-reduced-motion: reduce) {
  .agent-avatar[data-state="working"] .avatar-petal-group {
    animation: none;
  }
}
```

Contoh di atas hanya pola implementasi, bukan salinan kode xAI. CSS media feature `prefers-reduced-motion` memang ditujukan untuk menghormati preferensi pengguna terhadap motion yang tidak esensial ([Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion)); WCAG juga mewajibkan pengguna dapat mematikan motion yang dipicu interaksi bila bukan esensial ([WCAG 2.2, Success Criterion 2.3.3](https://www.w3.org/TR/WCAG22/#animation-from-interactions)).

Jika nanti membutuhkan motion yang dipicu event sekali saja (misalnya attention masuk), gunakan Web Animations API atau transition pendek, bersihkan animation saat unmount, dan jangan menjalankan loop JavaScript tiap frame. Jika benar-benar memakai `requestAnimationFrame`, waktu harus dihitung dari timestamp callback, bukan perhitungan frame tetap; callback itu akan berhenti pada banyak browser saat tab tersembunyi ([MDN: `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)). Untuk rekomendasi minimal ini, CSS sudah cukup.

## Performa

- Gunakan satu SVG, maksimal 3–5 path/group, dan hanya `transform`/`opacity` untuk motion berulang.
- Hindari animasi `filter: blur()`, `box-shadow`, `clip-path` kompleks, SVG filter, noise/particle canvas, dan request jaringan untuk avatar kecil.
- Jangan mount loop animasi untuk avatar yang tidak sedang `working`; rail bisa berisi banyak agent sekaligus.
- Hormati `prefers-reduced-motion`; state tetap terlihat lewat ring/warna dan teks.
- Karena Electron memakai Chromium, lakukan QA pada GPU lemah dan saat banyak agent muncul sekaligus. Pengukuran praktis: scroll transcript dan ganti agent tetap lancar; tidak ada lonjakan CPU saat semua avatar idle.

## Aksesibilitas

- Jika avatar hanya dekoratif seperti implementasi sekarang, pertahankan `aria-hidden="true"`; nama agent di dekatnya adalah accessible name yang benar.
- Jangan gunakan motion, warna, atau bentuk avatar sebagai satu-satunya sinyal `working`, error, atau kebutuhan input. Teks status harus tetap tersedia.
- Jangan masukkan avatar animasi ke `aria-live`; streaming message/status yang sudah ada lebih tepat menjadi informasi yang diumumkan.
- Pastikan kontrol rail tetap diberi `aria-label={agent.name}`. Perubahan avatar tidak boleh mengubah ukuran target klik atau focus ring.
- Uji dark/light theme dan high-contrast mode; ring status perlu cukup kontras dengan rail dan tidak bergantung pada merah/hijau saja.

## Checklist penerimaan jika diimplementasikan nanti

- [ ] Glyph, palette, dan motion adalah karya Pi Bot yang orisinal; tidak ada aset xAI/Grok yang disalin.
- [ ] Satu component menggantikan avatar inisial secara konsisten di rail, chat, working state, dan settings.
- [ ] Identitas agent deterministik setelah restart dari `agent.id`.
- [ ] `working` bergerak halus tanpa layout shift; idle tidak memakai animation loop.
- [ ] Reduced motion menonaktifkan motion berulang tanpa menghilangkan informasi status.
- [ ] Screen reader tetap memperoleh nama dan state agent dari teks.
- [ ] Typecheck/build lulus dan QA manual mencakup dark/light, 28/38/40 px, long transcript, multi-agent rail, dan keyboard focus.

## Sumber

Sumber first-party xAI dan observasi live:

- [Grok Bot product page](https://x.ai/bot) — observasi DOM/screenshot live 2026-08-14 terhadap `svg.grok-bot-mark` dan state-nya.
- [xAI Enterprise networking](https://docs.x.ai/build/enterprise)
- [Grok FAQ](https://x.ai/legal/faq)

Standar/dokumentasi platform untuk rekomendasi implementasi:

- [W3C Media Queries Level 5 — `prefers-reduced-motion`](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion)
- [W3C WCAG 2.2 — Animation from Interactions](https://www.w3.org/TR/WCAG22/#animation-from-interactions)
- [MDN — `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
