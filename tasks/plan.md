# Implementation plan

1. Replace the three-variant prototype shell with the selected agent-first Conversation Workspace MVP.
2. Add a small Electron main-process session service around Pi SDK persistence, workspace settings, model controls, and IPC events.
3. Add renderer state for agents, agent-scoped sessions, transcript hydration, secondary history/new-chat actions, controls, and stop/error states.
4. Run typecheck/build, then manually exercise the real Electron app and fix issues found.
5. Audit scope against `docs/mvp-spec.md` and hand off the runnable commands and known boundary.
