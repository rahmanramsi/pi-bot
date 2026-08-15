# Spec: Panel kanan Files dan Browser

## Objective

Tambahkan sidebar kanan yang dapat di-resize ke tampilan chat Pi Bot. Sidebar adalah area tab tanpa judul; pengguna dapat menambah tab Files atau Browser tanpa meninggalkan percakapan.

Pengguna dapat:

- menambah, memilih, dan menutup tab **Files** atau **Browser** tanpa menutup chat;
- mengatur lebar panel kanan, lalu mendapatkan lebar, visibilitas, dan tab terakhir untuk session yang sama saat aplikasi dibuka lagi;
- menelusuri, memfilter, dan membuka file yang aman di workspace aktif;
- membuka URL HTTP(S) di browser terisolasi, bernavigasi, dan membukanya di browser default.

Browser tetap terlihat dan dapat dikendalikan pengguna. Setiap tab Browser memiliki profile persisten yang terisolasi; login/manual sign-in berlaku untuk tab itu saja dan tidak dibagikan ke tab atau chat lain. Agent pada chat aktif mendapat tool sempit: `tabs` menemukan tab pada session chat, `read` mengembalikan konten terlihat serta target stabil, lalu `navigate`, `click`, `type`, dan `submit` menjalankan navigasi atau kontrol normal yang masih terlihat dan enabled. Agent tidak mendapat cookie, local storage, password, credential API, download, popup, atau akses ke tab pada chat lain. Files v1 adalah tampilan file workspace yang sudah ada; upload bahan ke model ditunda sampai kontrak model/context ditetapkan.

## Tech stack

- Electron 43, Node.js ESM main process
- React 19, TypeScript, Vite 8, Tailwind/shadcn primitives
- `typebox` sebagai direct runtime dependency untuk schema Browser tool

## Commands

```bash
npm run typecheck
npm run build
npm run smoke:packaged
git diff --check
```

## Project structure

```text
electron/main.mjs       Browser guest hardening and workspace-file IPC
electron/preload.cjs    narrow, typed renderer calls
src/types.ts            bridge and file-list contracts
src/App.tsx             panel state and product UI
src/styles.css          panel layout, resize handle, responsive overlay
tasks/plan.md           implementation order and checkpoints
tasks/todo.md           executable work items
```

## Code style

- Use plain, small functions and explicit names.
- Keep security decisions in `electron/main.mjs`; never give the renderer Node access.
- UI copy names the user task, not technical implementation detail.

```ts
type WorkspaceFile = { path: string; kind: "file" | "folder" };

function isInsideWorkspace(workspace: string, target: string) {
  const relative = path.relative(workspace, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}
```

## Testing strategy

The repository uses Node's built-in test runner through `npm test`; the current suite covers persistence, Browser action/JSDOM, and renderer-contract tests. Browser action and JSDOM tests live in `tests/browser-automation.test.mjs`.

Validation is:

1. `npm test`, `npm run typecheck`, and `npm run build`.
2. `npm run smoke:packaged` after the production build.
3. Manual Electron check: resize panel; switch tabs; reopen app to confirm state; open/reveal a workspace file; use the active chat agent's Browser tool across multiple tabs; verify popup, file URL, and browser permissions are rejected.

## Boundaries

- Always: resolve workspace paths in main process; skip symlinks; bound file listings; validate browser URLs; preserve the three-column layout and existing session-sidebar behavior.
- Ask first: new dependency, model attachment/upload support, broader computer use, downloads, browser credential sharing, settings schema migration, or changes to provider/Pi runtime behavior.
- Never: expose Node APIs to the renderer; load browser preloads; permit non-HTTP(S) browser URLs; parse shell output as file paths; let the renderer attach an arbitrary guest or pass a raw `webContents` ID; expand Browser beyond visible normal controls without a new security decision.

## Success criteria

1. Chat has a titleless, resizable right sidebar with tabs that users can add as **Files** or **Browser**.
2. The panel resizes by drag and remembers its visibility, tab, and width locally per session; it becomes an overlay at narrow widths.
3. Files menawarkan tree yang dapat difilter serta hanya membuka path di workspace agent terpilih.
4. Each Browser tab uses its own isolated persistent partition, no Node/preload/permissions/popups, and accepts only credential-free HTTP(S) URLs.
5. The active chat agent can call `tabs`, then use `read` targets for visible controls across multiple Browser tabs; hidden and disabled controls fail with stable redacted errors.
6. Switching from Browser to another tab does not destroy or reload the browser guest, and an active operation is visible in both its panel and tab strip.
7. Typecheck, build, packaged smoke, and `git diff --check` pass.

## Open questions

- Which file formats and maximum sizes should be supported as user-provided input for a future upload flow?
- Should browser history/cookies be cleared per session, per agent, or only from Settings?
