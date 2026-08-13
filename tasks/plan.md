# Implementation plan

1. Replace the three-variant prototype shell with the selected agent-first Conversation Workspace MVP.
2. Add a small Electron main-process session service around Pi SDK persistence, workspace settings, model controls, and IPC events.
3. Add renderer state for agents, agent-scoped sessions, transcript hydration, secondary history/new-chat actions, controls, and stop/error states.
4. Run typecheck/build, then manually exercise the real Electron app and fix issues found.
5. Audit scope against `docs/mvp-spec.md` and hand off the runnable commands and known boundary.

## Next stage: Stage 2 — Stable Agent Workspace

1. Reconcile the product contract with the shipped behavior: custom agents, optional instructions, chat transcript, and read-only boundaries.
2. Harden agent and session persistence, including agent-scoped history, restart recovery, and custom-agent lifecycle rules.
3. Add focused automated coverage for pure normalization, session mapping, event grouping, and abort/error transitions.
4. Finish conversation reliability and accessibility: explicit left/right rails, safe scroll-follow, keyboard disclosure, and recoverable composer states.
5. Run the first-run/restart/agent/history/stream/scroll/stop/error manual QA matrix at desktop and narrow window sizes.
6. Defer write tools, orchestration, cloud sync, attachments, and packaging until this stage is green and reviewed.
