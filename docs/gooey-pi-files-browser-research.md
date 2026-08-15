# Files dan Browser: pelajaran dari GooeyPi

Riset tanggal: 2026-08-14  
Sumber yang dikaji: [am-will/gooey-pi](https://github.com/am-will/gooey-pi) pada commit [`54eae316`](https://github.com/am-will/gooey-pi/tree/54eae316611246578837fad29695cab6287daba5).  
Status: rekomendasi desain untuk Pi Bot; belum diimplementasikan.

## Kesimpulan

GooeyPi menunjukkan dua pemisahan yang tepat untuk dipinjam:

1. **Browser pengguna tidak sama dengan kontrol Browser AI yang lebih luas.** Pengguna dapat menjelajah dan memberi anotasi; kontrol AI yang lebih luas adalah capability terpisah, dibatasi per sesi, dan dapat dimatikan. Pi Bot saat ini hanya menyediakan tool visible-page yang sempit.
2. **Keamanan file/browser berada di proses utama Electron.** Renderer hanya menampilkan UI. Semua path, URL, download, dan tindakan desktop divalidasi lagi sebelum dijalankan.

Namun GooeyPi adalah workspace untuk coding agent. Pi Bot untuk pengguna umum tidak perlu meniru panel file tree, Git status, terminal, worktree, atau multi-tab agent control pada tahap awal.

## Kontrak panel kanan

**Browser** dan **Files** bukan halaman atau sidebar utama. Keduanya hidup dalam satu **panel kanan kontekstual** yang dapat di-resize.

Panel ini adalah ruang pendamping percakapan: pengguna dapat tetap membaca atau menulis di chat sambil melihat hasil, bahan, atau halaman web. Tab awalnya:

- **Ringkasan** — konteks percakapan dan status kerja saat ini.
- **Files** — Bahan saya dan Hasil AI.
- **Browser** — halaman untuk riset atau preview hasil web.

Panel harus tetap terbuka saat pengguna berpindah tab sehingga Browser tidak reload dan daftar Files tidak kehilangan posisi. Lebar panel disimpan secara lokal, memiliki batas minimum/maksimum yang nyaman, dan pada jendela sempit berubah menjadi overlay yang dapat ditutup—bukan memaksa chat menjadi tidak terbaca.

Untuk pengguna umum, label tab memakai hasil dan aktivitas nyata. Jangan menampilkan istilah seperti `Inspector`, `worktree`, atau `project files` sebagai bahasa produk.

## Yang perlu diadopsi

### Files: koleksi hasil dan bahan, bukan file explorer

Bangun satu ruang bernama **Files** dengan dua bagian:

- **Bahan saya** — dokumen, gambar, PDF, atau spreadsheet yang pengguna pilih untuk dipakai AI.
- **Hasil AI** — presentasi, gambar, dokumen, atau halaman yang dibuat/direvisi AI dalam percakapan.

Setiap item memakai thumbnail atau ikon tipe file, nama yang mudah dibaca, waktu, asal percakapan, dan aksi **Lihat**, **Ubah dengan AI**, **Buka di Finder**, serta **Bagikan/ekspor** jika fitur itu sudah ada. Path hanya tampil di Details.

GooeyPi memang memiliki `FilesPanel`, tetapi ia memindai seluruh project, menyaring path, dan memberi status Git. Yang berguna bagi Pi Bot adalah disiplin di bawahnya: file hanya boleh dibaca dari root yang sudah diberi izin, symlink tidak diikuti, direktori besar dibatasi, dan UI hanya menerima hasil listing yang telah diotorisasi di proses utama. Lihat [FilesPanel](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/src/components/inspector/FilesPanel.tsx) dan [project authorization/listing](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/electron/main/projects.ts#L513-L545).

### Browser: lihat, tandai, lalu minta revisi

Browser v1 sebaiknya adalah **browser pribadi di dalam Pi Bot**:

- address bar, Back/Forward/Reload, history pendek, dan **Buka di browser utama**;
- halaman dapat dibuka untuk riset atau meninjau website yang dibuat AI;
- pengguna dapat memilih elemen halaman, memberi komentar seperti “tombol ini terlalu besar”, lalu komentar itu dilampirkan ke pesan berikutnya.

Ini adalah pola yang paling bernilai dari GooeyPi. `BrowserPanel` menyimpan riwayat terbatas dan mengubah elemen yang ditunjuk menjadi anotasi bertipe data, kemudian melekatkannya ke prompt. Payload dari halaman dianggap tidak tepercaya dan dibatasi ukuran/karakternya sebelum masuk UI atau model. Lihat [BrowserPanel](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/src/components/inspector/BrowserPanel.tsx) dan [sanitasi anotasi](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/src/lib/browser-annotations.ts).

## Jangan adopsi dulu

| GooeyPi | Alasan ditunda di Pi Bot |
| --- | --- |
| Full file tree, Git, terminal, worktree | Bahasa dan mental modelnya programmer-first. |
| Kontrol Browser/computer AI yang lebih luas | Membutuhkan lifecycle tab, batas resource, observability, dan kebijakan aksi yang matang. |
| Click/type/scroll otomatis oleh AI | Berisiko saat halaman membawa akun, pembayaran, form, atau informasi pribadi. |
| Mengizinkan AI mengambil alih tab pengguna | Cocok untuk pengguna berpengalaman, tetapi bukan default aman untuk produk umum. |

## Urutan implementasi yang disarankan

### Fase 1 — Files dan Browser yang dikendalikan pengguna

1. **Panel kanan resizable**: Ringkasan, Files, dan Browser, dengan state aktif/lebar tersimpan per perangkat.
2. **Files / Bahan saya**: native file picker; salin atau catat referensi file sesuai model penyimpanan yang diputuskan; tampilkan nama, tipe, ukuran, dan hapus dari konteks chat.
3. **Files / Hasil AI**: result card setelah respons AI, dengan preview untuk gambar, PDF, dan HTML serta Open/Reveal.
4. **Browser / Tinjau**: satu webview terisolasi untuk navigasi manual dan preview halaman hasil AI. Pi Bot issue #10 now also exposes a narrow `tabs`/`read`/`navigate`/`click`/`type`/`submit` tool for visible controls in the active chat session.
5. **Anotasi**: pilih elemen, tulis komentar, tampilkan sebagai attachment yang jelas sebelum pesan dikirim.

Hasil fase ini: pengguna umum dapat membawa bahan, melihat hasil, dan memberi arahan visual tanpa mengetahui path atau menjelaskan ulang lokasinya.

### Fase 2 — Kontrol Browser AI yang lebih luas, dengan persetujuan

Untuk perluasan di luar tool visible-page yang sempit dan sudah shipped, tambahkan capability **Bantu di browser** yang selalu off secara default. Saat aktif, AI hanya boleh membaca halaman/tab yang sedang pengguna pilih. Aksi yang mengubah keadaan—klik, mengetik, mengunduh, login, submit, atau membuka tab baru—harus dipisahkan sebagai proposal yang jelas untuk disetujui pengguna. Kontrol Browser/computer AI yang lebih luas tetap future/deferred; tool Pi Bot saat ini tidak menyentuh password-bearing forms, downloads, popup, credentials, atau arbitrary guest attachment.

GooeyPi mengimplementasikan versi yang jauh lebih kuat: tab terikat sesi, maksimum 6 tab per sesi dan 24 total, service browser berada di main process, dan tab Preview milik pengguna tidak bisa ditutup agent. Struktur ini layak dijadikan referensi bila Pi Bot benar-benar sampai ke tahap kontrol Browser AI yang lebih luas. Lihat [AgentBrowserService](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/electron/main/browser/agent-service.ts).

## Batas keamanan minimum Browser

Ambil guardrail GooeyPi ini sejak Browser v1, bukan setelahnya:

- Setiap Browser tab menggunakan storage partition persisten sendiri, terpisah dari renderer utama, tab lain, dan chat lain; manual sign-in berlaku untuk tab itu saja.
- Guest webview tidak memiliki Node, preload, izin browser, popup, atau nested webview.
- Terima hanya `http:` dan `https:` tanpa username/password di URL; blokir redirect dan frame navigation yang melanggar aturan sama.
- Semua action desktop dan file-path diverifikasi di main process; renderer tidak boleh memiliki akses Node langsung.
- Download memerlukan user gesture, URL aman, batas ukuran, batas jumlah, dan save dialog atau nama tujuan unik; jangan overwrite otomatis.
- Sediakan **Hapus data browser** agar history, cookie, dan cache di partition dapat dibersihkan.

GooeyPi menerapkan hardening ini dalam [webview gate](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/electron/main/index.ts#L136-L157), [permission denial untuk browser partition](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/electron/main/index.ts#L858-L860), dan [download guard](https://github.com/am-will/gooey-pi/blob/54eae316611246578837fad29695cab6287daba5/electron/main/browser-downloads.ts).

## Dampak ke Pi Bot saat ini

Pi Bot sudah punya Electron main process, preload bridge yang sempit, `contextIsolation: true`, dan `nodeIntegration: false`. Browser issue #10 mengikat guest dari `did-attach-webview` di main process, memberi renderer hanya nilai tab/session opaque, dan memeriksa partition per-tab sebelum action. Tidak perlu menambah SDK provider atau memberi renderer kemampuan Node.

Kontrol Browser AI yang lebih luas dan File input ke model adalah pekerjaan terpisah/future: keduanya memerlukan kontrak penyimpanan, izin, ukuran file yang didukung, dan cara memberi konteks ke Pi runtime sebelum UI dijanjikan ke pengguna.
