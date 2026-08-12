# Chat UX research: percakapan vs activity log

Tanggal riset: 2026-08-12

Laporan ini memakai sumber first-party xAI/Grok saja: dokumentasi Grok Bot, dokumentasi Grok web/app, dan dokumentasi API xAI. Tidak ada sumber sekunder atau perubahan application code. xAI mendokumentasikan affordance dan alur, tetapi tidak mempublikasikan spesifikasi pixel untuk bubble, warna, spacing, atau ukuran composer. Rekomendasi visual di bawah adalah inferensi desain dari perilaku yang didokumentasikan, bukan klaim tentang layout internal Grok.

## Keputusan inti

Pi Bot sebaiknya memiliki dua lapisan yang terlihat berbeda, tetapi tetap berada dalam satu urutan waktu:

```text
Percakapan (yang dikatakan manusia/agent)
  You      ── pertanyaan atau instruksi
  Planner  ── jawaban yang bisa dibaca dan dirujuk

Activity log (yang dilakukan runtime untuk menghasilkan jawaban)
  Read · src/App.tsx                         running → done
  Grep · "SessionManager"                    done
  Error · model tidak tersedia                failed
```

- **Conversation turn** menjawab “siapa berbicara dengan siapa dan apa hasilnya”. Gunakan label speaker yang konsisten, avatar/warna per role, lebar baca yang nyaman, dan body yang bisa dibaca sebagai Markdown/teks.
- **Activity item** menjawab “apa yang sedang/sudah dilakukan sistem”. Gunakan baris lebih ringkas, nama tool yang eksplisit, status `running`/`done`/`failed`, timestamp, dan detail yang bisa dibuka-tutup. Activity tidak boleh tampak seperti pesan agent biasa.
- Pertahankan urutan event asli. Secara konseptual, setiap assistant turn memiliki `turnId`; tool/status rows ditautkan ke turn tersebut walaupun tampil inline di transcript.
- Streaming memperbarui satu assistant message yang sama. Tool calls adalah event diskret dengan lifecycle start/update/end, bukan token teks yang dicampur ke jawaban.
- Status/error adalah metadata operasional. Jangan menyamarkan error sebagai jawaban agent; letakkan dekat composer dan tetap pertahankan transcript.

## Bukti first-party dan implikasi UX

| Area | Perilaku yang didokumentasikan | Implikasi untuk Pi Bot |
| --- | --- | --- |
| Identitas dan turn | Grok Bot adalah teammate bernama dengan job, conversation, dan working context sendiri. Deskripsi Bot menyimpan aturan durable; pesan menyimpan instruksi task-specific ([Create and manage Bots](https://docs.x.ai/grok-bot/bots), [Grok Bot overview](https://docs.x.ai/grok-bot/overview)). | Bedakan `You` dari nama agent aktif. Role/scope harus tetap terlihat di header/context; jangan campur instruksi satu kali dengan identitas agent. |
| Pesan vs aktivitas | xAI menjelaskan “message it like a teammate”; transcript dapat menampilkan tool activity, computer use, created files, questions, dan approval requests **bersama** pesan normal ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)). | Activity memang inline di transcript, tetapi secara semantik bukan bubble pesan. Tampilkan sebagai row/event yang lebih padat, dapat dicollapse, dan jelas statusnya. |
| Redirect dan stop | Pesan baru dapat mengarahkan ulang pekerjaan yang sedang berjalan; “Stop now” menghentikan pekerjaan tetapi tidak membatalkan aksi yang sudah selesai ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)). | Composer harus menunjukkan state aktif dan affordance Stop. Bila Pi belum mendukung redirect saat streaming, jangan memberi kesan bahwa draft yang diketik otomatis masuk ke turn aktif. |
| Thread dan navigasi | Reply dalam thread menjaga transcript utama tetap fokus sambil menyimpan konteks keputusan. Search/command palette dapat menemukan pesan, file, link, atau routine dan melompat ke lokasi yang cocok ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)). | Bedakan **thread/session history** dari activity log. Pi sudah punya session history scoped ke agent; nested thread/search dapat menjadi fase berikutnya, bukan alasan untuk membuat log utama lebih padat. |
| Composer dan attachment | Composer Grok mendukung attachment control/drag-and-drop, paste image/link, dan sampai enam attachment desktop; upload selesai sebelum respons, dan hasil/file/tool result muncul sebagai cards yang bisa dipreview ([Files and results](https://docs.x.ai/grok-bot/files-and-results)). Consumer FAQ juga mendokumentasikan tombol `+`, multi-file, konfirmasi upload, serta error ukuran/format dan “Tap to retry” ([Grok FAQ – Files & Data](https://docs.x.ai/grok/faq)). | Jangan menambah ikon attachment sebagai hiasan. Jika kelak ditambahkan, perlu preflight, upload/success/error state, batas ukuran, dan representasi attachment yang terpisah dari body pesan. MVP Pi saat ini cukup dengan composer teks + Stop. |
| Hasil yang dapat diaudit | xAI menyarankan hasil memisahkan facts, assumptions/inferences, actions completed, actions waiting for approval, dan unresolved questions; bukti dapat mencakup source links, screenshots, timestamps/time zones, file names, action log, dan hal yang tidak terverifikasi ([Files and results](https://docs.x.ai/grok-bot/files-and-results)). | Untuk agent Researcher/Planner, label evidence/inference/open questions dapat meningkatkan reviewability. Jangan menyebut chain-of-thought sebagai bukti; gunakan path/tool output/source link yang benar-benar terlihat. |
| Attention state | Bot list membedakan Needs attention (question/approval/handoff), unread activity, dan working/typing. Membuka conversation menandai activity sebagai read; error muncul di atas composer dan dapat menyertakan request ID ([Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications)). | Pi dapat membedakan Ready, Working, Error, dan (jika kelak ada) Needs input. Error perlu dekat composer, retain transcript, dan memberi tindakan yang bisa dilakukan—retry, stop, reconnect, atau change folder. |
| Recovery/status | Troubleshooting xAI menganjurkan langkah paling tidak destruktif: retry/reopen, restart, recover/update, lalu reset sebagai pilihan terakhir; status sidebar/conversation dan pertanyaan/approval/login harus diperiksa ([Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)). | Status bukan dekorasi. Tampilkan status runtime yang jujur dan jangan menghapus history ketika generation gagal atau di-abort. |
| Streaming | xAI API mengirim text delta melalui SSE agar teks tampil real-time ([Streaming](https://docs.x.ai/developers/model-capabilities/text/streaming)). Reasoning dapat dikirim sebagai event terpisah (`response.reasoning_text.delta` / `response.reasoning_summary_text.delta`) ([Reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning)). | Update satu assistant row secara incremental. Jika suatu hari menampilkan progress reasoning, batasi ke ringkasan/status yang aman dan jelas—bukan hidden chain-of-thought. |
| Tool lifecycle | Responses API memakai item typed seperti `function_call` dan `function_call_output`, lalu melanjutkan turn dengan output tool ([Function Calling](https://docs.x.ai/developers/tools/function-calling)). | Render tool sebagai event diskret dengan start/update/end dan result/error terpisah dari prose assistant. Ini mendukung log yang bisa dipindai tanpa membuat output tampak seperti percakapan agent. |
| Citations/provenance | xAI mengembalikan daftar semua URL yang ditemui dan optional inline citations dengan metadata posisi; citation dapat muncul saat streaming ([Citations](https://docs.x.ai/developers/tools/citations)). | Jika Pi memperoleh source path/line dari tool lokal, tampilkan sebagai evidence metadata/chip. Jangan menampilkan URL/citation yang tidak benar-benar diperoleh runtime. |
| Timestamp dan lifecycle | REST response memiliki `created_at`, optional `completed_at`, typed `output`, dan `error` object ([REST API – Chat](https://docs.x.ai/developers/rest-api-reference/inference/chat?cluster=us-east-1)). WebSocket turns serial, meneruskan state dengan `previous_response_id`, dan mendokumentasikan error reconnect seperti `previous_response_not_found` ([WebSocket Mode](https://docs.x.ai/developers/advanced-api-usage/websocket-mode)). | Simpan timestamp dari event/session source, bukan hanya waktu render. Tampilkan waktu singkat untuk scan dan detail timezone/ID saat dibutuhkan. Jika reconnect ditambahkan nanti, tampilkan state reconnect dan jangan menggandakan turn. |

## Pemetaan ke Pi Bot saat ini

Pi Bot sudah memiliki fondasi event-driven yang cocok untuk model dua lapisan:

- [src/types.ts](../src/types.ts#L57-L83) memodelkan `TimelineItem` dengan `kind` `user`/`assistant`/`tool`/`status`, timestamp, body, dan status; `PiEvent` memodelkan assistant delta, tool start/update/end, agent lifecycle, abort, error, dan session sync.
- [src/App.tsx](../src/App.tsx#L111-L145) merender satu `event-row` per item, timestamp + marker + label/status. Tool sudah memakai `<details>` sehingga detail dapat dicollapse.
- [src/App.tsx](../src/App.tsx#L621-L645) menambahkan user row dan assistant placeholder, lalu menggabungkan delta ke assistant row yang sama; Stop menggantikan tombol send saat `busy`.
- [electron/main.mjs](../electron/main.mjs#L249-L319) membangun transcript persisted dari message user/assistant/toolResult, menyalin timestamp message, dan memasangkan tool call dengan result/error.
- [electron/main.mjs](../electron/main.mjs#L381-L425) meneruskan text delta dan tool lifecycle ke renderer. Ini sudah cocok dengan prinsip “assistant streaming + discrete tool events”.
- [src/styles.css](../src/styles.css#L70-L78) saat ini memilih gaya work-log: semua item adalah `event-row` dengan garis pemisah, marker, timestamp, dan status chip; composer berada di bawah panel transcript.
- [docs/mvp-spec.md](mvp-spec.md#L11-L40) menegaskan session history per workspace/agent, tool read-only (`read`, `grep`, `find`, `ls`), Stop saat streaming, dan non-goal attachment/cloud sync/writes/orchestration.

### Perbedaan penting dari pola yang diinginkan

1. **Semua item memakai bentuk row yang sama.** Warna marker dan label membedakan kind, tetapi user/assistant belum terasa sebagai conversation bubbles/turns sementara tool terasa sebagai activity log.
2. **Tool live memakai `time()` renderer.** Persisted rows memakai timestamp dari Pi message, sedangkan `tool-start` memakai waktu lokal saat relay diterima. Ini dapat membuat sumber timestamp live dan persisted tidak konsisten.
3. **Belum ada auto-follow/scroll policy.** `.event-rows` memang scrollable, tetapi belum ada aturan “follow jika dekat bottom, pause jika user membaca history, tampilkan new activity saat tertinggal”.
4. **Error berada di atas transcript.** [src/App.tsx](../src/App.tsx#L695-L706) menaruh `error-line` setelah header dan sebelum rows; xAI mendokumentasikan error di atas composer. Posisi sekarang masih terlihat, tetapi tindakan pemulihan perlu lebih dekat ke composer.
5. **Speaker label persisted belum satu sumber.** Render assistant memakai `assistantLabel` aktif, sedangkan row baru/persisted menyimpan label `Pi Bot` di beberapa tempat. Secara UX, nama agent aktif harus konsisten di semua state tanpa mengubah identitas session secara diam-diam.

## Rekomendasi implementasi bertahap

### P0 — aman untuk MVP read-only

1. **Pisahkan visual conversation dan activity.** Pertahankan urutan yang sama, tetapi gunakan bubble/card ringan untuk `user` dan `assistant`; gunakan row compact/monospace dan disclosure untuk `tool`/`status`. Jangan menghapus activity dari transcript—hanya ubah hierarchy visual.
2. **Buat speaker identity eksplisit.** Render `You` dan nama agent aktif sebagai label/avatar yang selalu sama; gunakan `Tool · read`/`Tool · grep` untuk activity, bukan nama agent.
3. **Kelompokkan per turn.** Satu user message + assistant streaming + tool activity yang terkait harus dapat dipahami sebagai satu unit. Jika data model belum punya `turnId`, mulai dari grouping presentasional berdasarkan urutan event dan assistant placeholder; jangan membuat urutan baru.
4. **Pertahankan streaming in-place.** Assistant placeholder tetap berada di posisi awal turn; delta hanya memperbarui body/status row tersebut. Tool start/update/end tidak boleh membuat assistant message baru setiap delta.
5. **Definisikan scroll behavior.** Auto-follow hanya ketika user berada dekat bottom. Jika user scroll ke atas, jangan memaksa lompat; tampilkan indikator “new activity” dan tombol kembali ke latest. Ini adalah rekomendasi UX (xAI tidak mendokumentasikan algoritma scroll pixel-level).
6. **Jadikan error actionable.** Pertahankan transcript dan tampilkan error dekat composer dengan kategori jelas: `Retry`, `Stop`, `Change folder`, atau `Reconnect Pi` bila tindakan tersebut tersedia. Sertakan request/session ID hanya bila runtime memilikinya.
7. **Selaraskan timestamp.** Gunakan source timestamp untuk persisted events; untuk live events, simpan timestamp ketika event diterima dengan penanda timezone yang konsisten. Tampilkan waktu singkat untuk scan dan detail lengkap pada disclosure/tooltip.
8. **Dekatkan boundary read-only ke composer.** Context panel sudah menyatakan read-only; tambahkan copy singkat dekat input agar user tidak menganggap tool row dapat menulis atau menjalankan command.

### P1 — reviewability tanpa menambah capability

- Tambahkan activity summary seperti “Inspected 3 files · 2 searches · 1 result” yang dapat dibuka untuk detail; jangan menampilkan setiap partial output sebagai prose chat.
- Tampilkan path/line reference atau evidence metadata ketika benar-benar dikembalikan oleh tool. Bedakan `Evidence`, `Inference`, dan `Open questions` sebagai heading output, bukan sebagai klaim bahwa reasoning internal dapat diaudit.
- Batasi `aria-live` agar delta assistant diumumkan dengan wajar; tool partial updates sebaiknya tidak membanjiri screen reader. Ini perlu QA aksesibilitas saat implementasi.
- Tambahkan search/thread hanya jika ada kebutuhan nyata. Session history sidebar saat ini sudah menjadi surface sekunder yang terpisah dari transcript ([docs/mvp-spec.md](mvp-spec.md#L34-L40)).

### Defer — memerlukan keputusan produk/keamanan terpisah

Attachments, URL/web search, connectors, browser/terminal, replies/reactions, `@` mentions, groups/handoffs, background notifications, cloud sync, write tools, approval cards, dan custom agent roster. Semua mengubah capability/threat model; tidak layak ditambahkan hanya untuk meniru affordance Grok ([MVP non-goals](mvp-spec.md#L25-L30), [Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).

## Checklist QA untuk perubahan UX berikutnya

- User dan agent terlihat sebagai **pesan**; tool/status/error terlihat sebagai **activity** tanpa kehilangan urutan.
- Saat streaming, tepat satu assistant row berubah; tool rows tetap diskret dan memiliki status start/update/end.
- Nama agent aktif konsisten pada header, sidebar, current turn, dan reopened session.
- Timestamp live dan reopened session tidak berubah format/timezone secara mengejutkan.
- Scroll panjang tetap mengikuti generation hanya ketika user berada di bawah; manual reading tidak dirampas.
- Stop mengakhiri generation tanpa composer macet; abort/error tidak menghapus user prompt atau history.
- Error memiliki copy yang dapat ditindaklanjuti; transcript tetap tersedia untuk diagnosis.
- Tool detail dapat dicollapse dan tidak mengambil ruang sebesar jawaban utama.
- Attachment/approval/handoff tidak muncul sebagai affordance palsu selama belum didukung capability Pi.

## Sumber resmi

- [Grok Bot overview](https://docs.x.ai/grok-bot/overview)
- [Create and manage Bots](https://docs.x.ai/grok-bot/bots)
- [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)
- [Files and results](https://docs.x.ai/grok-bot/files-and-results)
- [Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications)
- [Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)
- [Grok FAQ – Files & Data](https://docs.x.ai/grok/faq)
- [Grok product page](https://x.ai/grok)
- [xAI Streaming](https://docs.x.ai/developers/model-capabilities/text/streaming)
- [xAI Reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning)
- [xAI Function Calling](https://docs.x.ai/developers/tools/function-calling)
- [xAI Citations](https://docs.x.ai/developers/tools/citations)
- [xAI WebSocket Mode](https://docs.x.ai/developers/advanced-api-usage/websocket-mode)
- [xAI REST API – Chat](https://docs.x.ai/developers/rest-api-reference/inference/chat?cluster=us-east-1)

