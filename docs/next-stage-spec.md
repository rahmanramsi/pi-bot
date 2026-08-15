# Pi Bot next stage — safe, testable local agents

Status: planned; do not treat the items below as shipped.

## Objective

Make the current local Electron prototype dependable for repeated use, with explicit permission decisions for write-capable tools and automated coverage for persistence and IPC behavior.

The primary user task remains: select an agent, ask it to work in its configured workspace, and understand both the answer and every consequential action it performed.

## Current baseline

Already implemented:

- Custom agent lifecycle and per-agent workspaces/instructions.
- App-owned and external workspaces with skill trust.
- Provider authentication and model selection.
- Agent-scoped persistent sessions and streaming tool events.
- Session-scoped Browser tabs with a narrow visible-page tool (`tabs`, `read`, `navigate`, `click`, `type`, `submit`) and redacted activity/errors.
- Conversation/activity separation, visible commands, Stop, autosizing composer, themes, settings, and design tokens.
- Narrow context-isolated Electron bridge.

Known gaps:

- `bash`, `edit`, and `write` are enabled without a sandbox or approval policy.
- Credentials fall back to a permission-restricted app file when Electron encryption is unavailable.
- No auto-update workflow.

## P0 — permission and execution safety

- Define explicit `allow` / `ask` / `deny` rules per tool and relevant resource scope.
- Require approval before write, edit, and shell actions unless a deliberately configured narrow rule allows them.
- Show the command, target, and expected effect before approval.
- Keep denied/cancelled actions visible in the per-turn working disclosure without converting them into assistant prose.
- Decide whether shell/filesystem execution remains on the host or moves into a sandboxed workspace runtime.
- Keep credential, workspace, and tool-policy state out of the renderer.

## P0 — automated contracts

- Add the smallest suitable test runner and an `npm test` script.
- Test agent normalization and persistence, including empty instructions.
- Test agent/workspace/session isolation and first-prompt title derivation.
- Test archive, restore, delete, and external-workspace preservation.
- Test provider prompt response/cancellation and credential-store boundaries without real secrets.
- Test transcript reconstruction and tool start/update/end mapping.
- Test autosize helpers and follow-latest behavior as pure logic where practical.
- Test IPC validation for invalid agent, session, model, reasoning, and auth payloads.

## P1 — reliability and recovery

- Add retry/reconnect actions for failures where the runtime exposes a safe recovery path.
- Preserve scroll position while reading older content and keep the Latest affordance reliable during streaming.
- Prevent model, reasoning, workspace, agent, or session changes while their active operation is still streaming.
- Define and test settings-schema migration before incrementing `settingsVersion`.
- Improve status semantics for Ready, Working, Error, and Needs input without implying background/cloud execution.

## P1 — maintainability

- Split `src/App.tsx` only when a boundary has clear state ownership; avoid component extraction that merely moves JSX.
- Keep design tokens in `src/styles.css` and shared controls in `src/components/ui`.
- Extract pure runtime validation and transcript-mapping functions when doing so enables tests.
- Document every new persisted field, IPC method, tool capability, and destructive behavior in the same change.

## Deferred

- Broad browser/computer use, MCP, connectors, and arbitrary extensions. The shipped Browser tool remains limited to visible normal controls in the active chat session.
- Subagents, handoffs, parallel tasks, background jobs, routines, and schedules.
- Cloud sync, accounts, billing, or collaboration.
- Attachments and structured artifact cards.
- Auto-update until the interaction/security model is stable.

## Commands

Current commands:

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm test
npm run dist
```

`npm test` runs the repository's Node test suite, including persistence and Browser JSDOM coverage.

## Project structure

```text
electron/main.mjs       runtime, persistence, sessions, providers, IPC
electron/preload.cjs    narrow renderer bridge
src/App.tsx             renderer state and application surfaces
src/styles.css          theme and design-system tokens
src/components/ui/      shared interface primitives
src/types.ts            renderer and IPC types
docs/                   current specs and research artifacts
tests/                  Node test suite, including Browser automation contracts
```

## Boundaries

- **Always:** validate IPC input, keep secrets out of the repository and renderer, show real tool activity, and run typecheck/build.
- **Browser IPC:** main owns guests observed through `did-attach-webview`; before mounting a webview, preload asks main for the opaque persistent partition derived from `browserPartitionForTab(sessionKey, tabId)`. Registration accepts only tab/session values and binds the already-attached guest whose actual partition matches that per-tab partition; no page-visible token or renderer `webContents` ID is accepted.
- **Ask first:** new runtime dependencies, tool-policy changes, settings-schema changes, credential-storage changes, or packaged releases.
- **Never:** claim sandboxing or approvals exist before they are implemented; expose Node APIs to the renderer; delete an external workspace; hide a command that was actually executed.

## Success criteria

1. Every write-capable action is governed by an explicit, visible policy.
2. Denied and cancelled actions leave the session recoverable.
3. Automated tests cover agent, session, auth-prompt, transcript, and IPC contracts.
4. Agent/workspace/session data remains isolated across switching and restart.
5. Current Electron manual QA still passes in light and dark modes at the minimum window size.
6. Documentation, implementation, and exposed product capabilities describe the same boundary.

## Open decisions

- Which operations may be safely pre-approved, if any?
- Is host execution acceptable for this product, or is a sandbox required before broader use?
- Should encrypted credential storage be mandatory instead of allowing the current file fallback?
