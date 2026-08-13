# Spec: Pi Bot Stage 2 — Stable Agent Workspace

## Objective

Make the published Pi Bot MVP dependable for repeated local use. The selected agent, its custom instructions, and its conversation history must remain understandable and correct across agent switching, new conversations, restarts, streaming responses, and recoverable errors.

The primary user task remains: choose an agent, ask about the selected workspace, and understand the answer and the work it performed.

## Assumptions

1. Pi remains local-first and continues to use the user's existing local Pi authentication.
2. Agent creation and customization are in scope; built-in agents remain protected templates.
3. Custom instructions may be intentionally empty. Tool permissions are controlled by the runtime allowlist, not by a user-written instruction.
4. `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls` are the enabled tools in this stage.
5. This stage targets the existing Electron desktop app, not a web or mobile build.

## Scope

### P0 — Contract and data integrity

- Bring `docs/mvp-spec.md`, `README.md`, and task notes in line with the implemented custom-agent and chat behavior.
- Verify create, edit, duplicate, archive/restore, and delete behavior for custom agents.
- Preserve empty custom instructions without replacing them with user-visible filler text.
- Keep agent-scoped session mappings isolated across workspace changes and app restarts.
- Prevent built-in agents from being deleted or archived.

### P0 — Conversation reliability

- Keep user messages on the right rail and agent responses on the left rail at desktop and narrow window sizes.
- Keep streaming text in one assistant message; keep tool activity grouped and secondary.
- Follow new output only when the reader is near the bottom; preserve the reader's position otherwise.
- Make Stop, retry, and failure states recoverable without a stuck composer or duplicate session.
- Ensure keyboard focus, disclosure controls, and status text remain usable without relying on color alone.

### P1 — Verification and maintainability

- Extract pure validation/normalization and transcript-event mapping logic where needed so it can be tested without launching Electron.
- Add automated tests for agent persistence, empty instructions, session selection, event grouping, and error/abort transitions.
- Add a repeatable Electron manual QA matrix covering first run, restart, agent switching, history, streaming, scroll, stop, and runtime failure.
- Keep the renderer behind the existing narrow, context-isolated IPC bridge.

### Deferred

- Browser automation, arbitrary extensions, and permission approvals.
- Automatic multi-agent orchestration, handoffs, background jobs, and schedules.
- Cloud sync, accounts, billing, team collaboration, and provider/API-key management.
- Attachments, export, structured artifact cards, and packaged auto-update distribution.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm test
```

`npm test` is a Stage 2 addition and should use the smallest test runner that fits the existing project; prefer a built-in or already-installed option before adding a dependency.

## Project Structure

```text
src/                   renderer state, chat layout, accessibility
electron/main.mjs      Pi session lifecycle, persistence, IPC validation
electron/preload.cjs   narrow renderer bridge
tests/                 pure domain and IPC-adjacent tests
docs/                  product/spec and research artifacts
tasks/                 ordered implementation plan and checklist
```

## Code Style

Keep domain decisions explicit and boring. Prefer small pure functions over hidden state transitions:

```ts
function canDeleteAgent(agent: AgentProfile): boolean {
  return !agent.builtIn && !agent.archived;
}
```

Use existing TypeScript types, preserve the current IPC naming convention, and avoid adding a compatibility layer unless a concrete persisted-data migration requires it.

## Testing Strategy

- **Pure tests:** agent normalization, empty instruction handling, session-to-agent mapping, event grouping, and title derivation.
- **IPC contract tests:** valid and invalid payloads for agent/session actions, with no renderer access to Node APIs.
- **Build gate:** `npm run typecheck` and `npm run build` from a clean checkout.
- **Manual Electron QA:** first run, restart, create/edit/duplicate/archive/restore/delete custom agent, empty instruction, switch agent, new/open history session, long streaming response, scroll-up while streaming, stop, retryable error, and narrow-window alignment.

## Boundaries

- **Always:** validate IPC inputs, keep secrets out of the repository, run typecheck/build/tests before a commit, and show actionable failure states.
- **Ask first:** adding a new runtime dependency, changing Pi tool permissions, changing the persisted settings schema, or adding a packaged release workflow.
- **Never:** commit credentials, expose Node APIs to the renderer, or claim an agent changed files when it did not.

## Success Criteria

1. The written MVP/spec docs describe the behavior that is actually shipped, including custom agents and optional instructions.
2. A custom agent with an empty instruction can be created, reopened after restart, edited, duplicated, archived/restored, and deleted according to its state rules.
3. Switching agents or sessions never shows another agent's transcript or settings.
4. User and agent messages use stable right/left rails, and the layout remains readable at the supported narrow window width.
5. Streaming, tool activity, stop, retry, and error states do not strand the composer or lose the active session.
6. Automated tests plus the manual QA matrix pass, while `npm run typecheck` and `npm run build` remain green.

## Open Questions

- Should session titles remain derived from the first prompt, or should Stage 2 add explicit rename?
- Should archived custom agents remain visible in the sidebar by default, or only through the archived section?
- Is macOS packaging needed immediately after Stage 2, or only once the interaction model is stable?
