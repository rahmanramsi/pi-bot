# MVP checklist

- [x] Write scope, non-goals, and acceptance criteria.
- [x] Persist workspace and Pi sessions.
- [x] Implement history and new chat.
- [x] Implement model/thinking controls.
- [x] Implement streaming, tool activity, stop, and error states.
- [x] Remove prototype-only variant switcher and seed transcript.
- [x] Pass typecheck and production build.
- [x] Run manual Electron QA against a real authenticated Pi model.

## Stage 2 checklist — pending review

- [ ] Align `README.md`, `docs/mvp-spec.md`, and task notes with custom-agent and optional-instruction behavior.
- [ ] Verify and test custom-agent create/edit/duplicate/archive/restore/delete lifecycle.
- [ ] Verify empty custom instructions survive persistence and restart.
- [ ] Verify agent-scoped sessions and history never cross-contaminate after switching or reopening.
- [ ] Add focused automated tests for normalization, mappings, event grouping, and abort/error transitions.
- [ ] Verify right-aligned user messages, left-aligned agent responses, streaming, and safe scroll-follow at narrow width.
- [ ] Verify Stop, retry, and runtime error recovery without a stuck composer.
- [ ] Complete the Stage 2 manual QA matrix and rerun typecheck/build/tests.
- [ ] Review deferred boundaries before considering write-capable features.
