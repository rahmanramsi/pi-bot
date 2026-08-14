# Right workspace panel tasks

- [x] Task: Add the right-panel layout and local preferences.
  - Acceptance: a titleless tab strip can add, select, and close Files/Browser tabs; width and active tab persist; narrow view overlays panel.
  - Verify: `npm run typecheck`; manual resize and relaunch.
  - Files: `src/App.tsx`, `src/styles.css`.

- [x] Task: Add safe workspace Files IPC and UI.
  - Acceptance: only bounded non-symlink workspace entries list; Open and Reveal cannot escape workspace.
  - Verify: `npm run typecheck`; manual file/open/reveal checks.
  - Files: `electron/main.mjs`, `electron/preload.cjs`, `src/types.ts`, `src/App.tsx`, `src/styles.css`.

- [x] Task: Add the isolated Browser panel.
  - Acceptance: user can navigate an HTTP(S) page with browser back/forward/reload and open it externally; no popup, permission, or non-HTTP(S) navigation succeeds.
  - Verify: `npm run build`, `npm run smoke:packaged`; manual Electron checks.
  - Files: `electron/main.mjs`, `src/App.tsx`, `src/styles.css`.

- [x] Task: Document delivered scope and run release-equivalent validation.
  - Acceptance: README accurately describes the user-controlled panel boundary and all checks pass.
  - Verify: `npm run typecheck`, `npm run build`, `npm run smoke:packaged`, `git diff --check`.
  - Files: `README.md`, `docs/right-workspace-panel-spec.md`, `tasks/todo.md`.
