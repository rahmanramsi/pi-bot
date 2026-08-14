# Right workspace panel plan

## Vertical slices

1. **Layout first** — add right-panel state, a resize handle, persistent preferences, and a titleless tab strip with an add menu for Files or Browser.
2. **Files next** — add a main-process workspace listing plus open/reveal actions, then wire each Files tab to the narrow preload bridge.
3. **Browser last** — enable hardened, user-controlled Browser tabs with navigation and external-browser handoff. Browser-specific Electron policy must land before mounting a guest.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| File path escapes workspace | Main process canonicalizes and rechecks every list/open/reveal request; symlinks are excluded. |
| Remote page reaches privileged APIs | Webview has no preload or Node, uses a dedicated partition, blocks popups/permissions, and accepts only credential-free HTTP(S). |
| Browser reloads while switching tabs | Keep the mounted webview and hide inactive panel content with CSS, not conditional unmount. |
| Panel crowds the chat | Min/max widths; overlay layout at narrow window sizes. |

## Checkpoints

- After slice 1: typecheck and manual resize/persistence check.
- After slice 2: typecheck and manual file boundary/open/reveal check.
- After slice 3: build, packaged smoke, and manual HTTPS/popup rejection check.
