# Riset improvement Browser Pi Bot

Tanggal: 14 Agustus 2026  
Status: dasar keputusan untuk improvement Browser; bukan perubahan kontrak agar AI mengendalikan browser.

## Kesimpulan

Browser Pi Bot harus tetap menjadi browser pribadi yang dikendalikan pengguna di panel kanan. Implementasi sekarang sudah memiliki isolasi yang benar: guest tanpa Node/preload, sandbox dan context isolation aktif, popup/permission/download diblokir, serta navigasi non-HTTP(S) ditolak di proses utama. Namun Electron sekarang memperingatkan bahwa `<webview>` tidak stabil untuk rendering, navigasi, dan event routing, dan menyarankan `WebContentsView`, `iframe`, atau tidak melakukan embedding sama sekali. `iframe` bukan pengganti browser umum karena situs dapat menolak embedding; untuk Pi Bot, arah jangka panjang yang tepat adalah `WebContentsView` yang dimiliki proses utama. [Electron: webview warning](https://www.electronjs.org/docs/latest/api/webview-tag#warning) · [Electron: web embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds)

**Rekomendasi rilis ini:** pertahankan `<webview>` agar perubahan kecil dan teruji, lalu rapikan pengalaman pengguna serta observabilitas kegagalan. Jangan menambah browser automation, download, credential sharing, atau akses AI. Jadwalkan migrasi ke `WebContentsView` sebagai proyek terpisah karena view itu bukan elemen DOM dan harus disinkronkan ukurannya dari renderer ke proses utama. [Electron: WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view) · [Electron: BaseWindow content view](https://www.electronjs.org/docs/latest/api/base-window)

## Kondisi yang ditemukan

| Area | Kondisi saat ini | Dampak improvement |
| --- | --- | --- |
| Navigasi | Toolbar sudah punya Back, Forward, Reload/Stop, address bar, dan Buka di browser utama. | Tambahkan state halaman yang gagal/diblokir dan alamat yang dipilih pengguna agar browser tidak terasa diam. |
| Keamanan guest | `will-attach-webview` menghapus preload dan memaksa Node off, sandbox/context isolation/web security on. | Pertahankan sebagai penjaga utama; jangan memindahkan keputusan ini ke renderer. |
| Popup, permission, unduhan | Seluruhnya ditolak di main process. | Pertahankan penolakan, tetapi jelaskan hasilnya secara singkat kepada pengguna ketika terjadi. |
| Sesi | Awalnya satu profil persisten untuk seluruh aplikasi. | Karena panel kanan adalah milik session chat, gunakan partition persisten per session agar cookie/login dan state browsing tidak bocor ke percakapan lain. |
| Error dan proses crash | UI hanya menunjukkan spinner; kegagalan `loadURL()` diabaikan. | Tambahkan empty/error state dengan Retry dan Buka di browser utama; jangan tampilkan kode Chromium mentah. |

## Prioritas implementasi

### P0 — browser yang dapat dipahami pengguna umum

1. **State navigasi yang eksplisit.** Simpan URL aktif, judul halaman jika tersedia, status loading, dan error terakhir untuk setiap tab Browser. Gunakan event `did-fail-load` untuk membedakan kegagalan muat dari halaman yang masih loading. Electron mengekspos `errorDescription`, URL, dan penanda main frame pada event ini; tampilkan salinan sederhana seperti “Halaman tidak dapat dimuat” dan aksi **Coba lagi** / **Buka di browser utama**. [Electron: `did-fail-load`](https://www.electronjs.org/docs/latest/api/web-contents#event-did-fail-load)

2. **Feedback untuk tindakan yang sengaja diblokir.** Saat popup, permission, unduhan, atau URL non-web ditolak, tampilkan satu status sementara di panel: misalnya “Popup diblokir untuk keamanan. Gunakan Buka di browser utama bila diperlukan.” Jangan mengalihkan popup otomatis ke browser sistem. Electron mendukung penolakan window baru lewat `setWindowOpenHandler()` dan meminta aplikasi membatasi pembuatan jendela baru. [Electron: `setWindowOpenHandler`](https://www.electronjs.org/docs/latest/api/web-contents#contentssetwindowopenhandlerhandler) · [Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security#14-disable-or-limit-creation-of-new-windows)

3. **Navigasi yang aman dan jelas.** Terus validasi navigasi utama, redirect, dan frame di proses utama; event navigasi dapat dibatalkan dengan `preventDefault()`. Untuk produk umum, default-kan URL yang diketik tanpa skema ke `https://`; pertimbangkan menolak `http:` seluruhnya kecuali ada kebutuhan produk yang disetujui, karena panduan Electron meminta remote content dimuat melalui HTTPS. [Electron: navigation events](https://www.electronjs.org/docs/latest/api/web-contents#navigation-events) · [Electron security: secure content](https://www.electronjs.org/docs/latest/tutorial/security#1-only-load-secure-content)

4. **Aksesibilitas dan keyboard dasar.** Tombol harus tetap disabled sesuai history, address bar selalu memiliki label, `Enter` menavigasi, dan fokus kembali ke address bar setelah error. Ini adalah improvement UI saja; jangan menyuntikkan skrip atau membaca DOM halaman.

### P1 — ketahanan dan privasi yang terdefinisi

1. **Crash/unresponsive state.** Dengarkan guest yang hilang atau tidak responsif; Electron menyediakan `render-process-gone`, `unresponsive`, dan `responsive`. Tawarkan Reload setelah crash, tanpa me-restart aplikasi atau chat pengguna. [Electron: lifecycle events](https://www.electronjs.org/docs/latest/api/web-contents#event-render-process-gone)

2. **Kebijakan profil browser.** `persist:` membuat session bertahan dan dibagikan kepada semua page dengan partition yang sama; tanpa prefiks itu session hanya di memori. Keputusan yang perlu dipilih eksplisit:
   - **Satu profil Pi Bot:** login tetap ada lintas session chat. Paling sederhana, tetapi tidak sejalan bila pengguna menganggap “per session” mencakup cookie.
   - **Profil per session chat:** cookie/login terpisah per session dan harus diberi tombol “Hapus data browser session”; lebih privat, tetapi pengguna perlu login ulang.

   **Keputusan Pi Bot:** gunakan profil persisten per session chat, karena panel kanan memang terikat pada session. Tampilkan salinan UI yang jujur bahwa pengguna mungkin perlu login kembali pada percakapan lain. [Electron: webview partition](https://www.electronjs.org/docs/latest/api/webview-tag#partition) · [Electron: sessions](https://www.electronjs.org/docs/latest/api/session)

3. **Pertahankan deny-by-default.** Remote content wajib tetap tanpa Node integration, dengan context isolation, sandbox, dan web security aktif. Setiap session remote harus memiliki permission handler; `will-download` dapat dibatalkan menggunakan `preventDefault()`. Konfigurasi yang sekarang sudah mengikuti ini dan tidak boleh dilonggarkan demi UX. [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) · [Electron: permission request handler](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler) · [Electron: cancel download](https://www.electronjs.org/docs/latest/api/session#event-will-download)

4. **Validasi handoff ke browser sistem.** Hanya URL yang telah lolos parser dan allowlist protokol boleh diteruskan lewat `shell.openExternal`; jangan pernah membuka URL dari event halaman tanpa validasi ulang. [Electron security: `openExternal`](https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-shellopenexternal-with-untrusted-content)

## Migrasi arsitektur: setelah P0/P1 stabil

Ganti `<webview>` dengan `WebContentsView` hanya sebagai pekerjaan terpisah. Main process membuat satu view untuk tab Browser aktif, menetapkan `webPreferences` dan session yang sama ketatnya, mengatur bounds berdasarkan ukuran panel kanan, lalu mengirim event/status minimal ke renderer melalui IPC yang tervalidasi. Browser inactive perlu disembunyikan atau dihancurkan menurut kontrak tab yang dipilih; jangan membuat WebContents tanpa lifecycle yang jelas.

Alasan: Electron merekomendasikan menghindari `<webview>` karena perubahan arsitektur Chromium dapat mengganggu rendering, navigasi, dan event routing. `WebContentsView` adalah view native yang diadopsi oleh content view window dan satu `WebContents` hanya dapat dipresentasikan pada satu view dalam satu waktu. Itu cocok untuk browser di panel kanan, tetapi menambah koordinasi resize/tab sehingga tidak layak diselipkan ke patch UX kecil. [Electron: webview warning](https://www.electronjs.org/docs/latest/api/webview-tag#warning) · [Electron: WebContentsView constructor](https://www.electronjs.org/docs/latest/api/web-contents-view#new-webcontentsviewoptions)

## Batas yang tidak berubah

- AI tidak dapat melihat, menekan, mengetik, membaca cookie, atau memakai tab browser pengguna.
- Tidak ada preload di guest, Node integration tetap mati, dan tidak ada bridge Electron menuju halaman remote.
- Tidak ada download, popup, site permission, URL non-web, atau browser credential sharing tanpa keputusan produk baru.
- Perbarui Electron secara rutin; panduan resmi menjadikan versi Electron terkini sebagai bagian dari security checklist. [Electron security: current version](https://www.electronjs.org/docs/latest/tutorial/security#16-use-a-current-version-of-electron)

## Checklist penerimaan

1. URL HTTPS normal memuat, toolbar sinkron, Back/Forward/Reload bekerja, dan tab lain tidak menutup chat.
2. DNS/offline/SSL error menghasilkan pesan ramah pengguna dan Retry; guest crash/unresponsive juga memberi recovery yang setara.
3. Popup, unduhan, permission, `file:`, `mailto:`, dan redirect ke protokol lain tetap tidak melakukan tindakan tersembunyi.
4. Browser sistem hanya dibuka dari tindakan pengguna yang eksplisit dan URL sudah tervalidasi.
5. `typecheck`, build, packaged smoke test, dan uji Electron manual tetap lulus.
