# Chat UX research: conversation and activity

Research date: 2026-08-12  
Implementation review: 2026-08-14

This note uses first-party xAI/Grok documentation as the original interaction reference. xAI documents behavior and affordances, not a public pixel specification. Visual recommendations are design inferences; the implementation status below is verified against this repository.

## Core decision

Pi Bot uses two visually distinct layers in one chronological transcript:

```text
Conversation
  You        question or instruction
  Agent      readable result

Agent activity
  Ran npm run typecheck                running → success
  Read src/App.tsx                     success
  Error provider unavailable          failed
```

- Conversation answers who said what.
- Activity answers what the runtime did.
- Streaming updates one assistant message in place.
- Tool calls remain discrete lifecycle events rather than assistant prose.
- Errors and statuses remain operational metadata and never masquerade as an agent answer.

## First-party evidence and implications

| Area | Documented Grok behavior | Pi Bot implication |
| --- | --- | --- |
| Identity | A Bot is a named teammate with a durable job and conversation context ([Bots](https://docs.x.ai/grok-bot/bots), [overview](https://docs.x.ai/grok-bot/overview)). | Keep `You` and the active agent identity distinct and consistent across rail, header, settings, and transcript. |
| Messages and tools | Ordinary messages can coexist with tool activity, computer use, files, questions, and approval requests ([chat and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)). | Keep activity inline chronologically, but visually separate it from chat messages. |
| Stop and redirect | Users can redirect or stop work in progress; Stop does not undo completed actions ([chat and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)). | Expose Stop honestly. Do not imply that abort rolls back commands or file changes already completed. |
| Composer | Grok supports attachments and structured file/result states ([files and results](https://docs.x.ai/grok-bot/files-and-results), [FAQ](https://docs.x.ai/grok/faq)). | Do not add decorative attachment controls before upload, error, security, and artifact behavior exist. |
| Results | Results can distinguish facts, assumptions, completed actions, pending approvals, and unresolved questions ([files and results](https://docs.x.ai/grok-bot/files-and-results)). | Prefer visible tool evidence and explicit uncertainty; never expose hidden chain-of-thought as proof. |
| Attention | Working, unread, needs-attention, and error states are distinct ([settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications)). | Status must communicate a real runtime state and must not imply background/cloud execution. |
| Recovery | Recovery begins with the least destructive action: inspect, retry/reopen, restart, then reset as a last resort ([troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)). | Preserve transcript and session state when a response fails or is aborted. |
| Streaming | Text arrives as incremental deltas ([streaming](https://docs.x.ai/developers/model-capabilities/text/streaming)). | Append deltas to one agent message instead of creating repeated bubbles. |
| Tool lifecycle | Tool calls and tool outputs are separate typed items ([function calling](https://docs.x.ai/developers/tools/function-calling)). | Render start/update/end and result/error as inspectable activity state. |
| Provenance | Citations are tied to URLs actually encountered by the runtime ([citations](https://docs.x.ai/developers/tools/citations)). | Only show paths, commands, output, and URLs that were actually present in runtime events. |

## Implemented in Pi Bot

The current renderer and runtime now implement the main two-layer model:

- [`TimelineItem`](../src/types.ts) distinguishes `user`, `assistant`, `tool`, and `status`; `PiEvent` models assistant deltas, tool start/update/end, agent lifecycle, abort, error, authentication, and session sync.
- [`ChatMessage`](../src/App.tsx) keeps user turns on the right and agent turns on the left.
- Agent messages and the working state reuse the same `AgentAvatar` identity as the agent rail.
- Consecutive tool/status events are grouped under **Agent activity** without reordering the transcript.
- A collapsed command activity begins with `Ran` and includes the executed command.
- Expanding command activity shows `Shell`, the full `$ command`, output, and Running/Success/Failed outcome.
- The conversation follows new output only while the reader remains near the bottom; a **Latest** action appears when the reader falls behind.
- Stop replaces Send while a response is active.
- The compact composer grows vertically for multiline input up to its maximum height.
- The shared typography system keeps body and control text at the same base size; see [design-system.md](design-system.md).
- [`electron/main.mjs`](../electron/main.mjs) reconstructs persisted user, assistant, and tool events from Pi `SessionManager` data and relays live lifecycle events.

## Known gaps

1. Activity is grouped by consecutive presentation order, not an explicit persisted `turnId`.
2. Live tool timestamps are renderer receipt times, while reopened transcript timestamps come from persisted Pi messages.
3. The error banner is visible below the chat header, but it does not yet offer failure-specific retry/reconnect actions near the composer.
4. Tool execution is visible, but write/shell actions do not yet stop for an allow/ask/deny decision.
5. There are no attachment, approval-card, handoff, or background-task states.
6. Screen-reader behavior for rapid streaming and tool partial updates still needs dedicated manual QA.

## Next recommendations

### P0 — safety and recovery

- Add an explicit permission/approval event type before `bash`, `edit`, or `write` executes.
- Show target, command, and expected effect in the approval surface.
- Keep denied/cancelled actions in activity history with a readable state.
- Add recovery actions only when a real retry, reconnect, authenticate, or workspace-change path exists.

### P1 — auditability

- Persist a turn identifier if reliable grouping across restart becomes necessary.
- Normalize timestamp provenance and expose detailed timestamp/timezone only on demand.
- Add path/line or artifact metadata only when the underlying tool event supplies it.
- Consider output conventions such as Evidence, Inference, and Open questions without claiming access to hidden reasoning.

### Deferred

Attachments, URL fetching, connectors, MCP, browser/computer use, nested threads, mentions, groups, handoffs, background notifications, cloud sync, and scheduled routines require separate product and security decisions.

## QA checklist

- User and agent are visually recognizable as messages; tool/status/error remain activity.
- Exactly one assistant message changes during streaming.
- Agent avatar initials and color match across rail, settings, message, and working state.
- Commands remain visible when collapsed and full output remains available when expanded.
- Scroll follows only when the reader is near the bottom.
- Stop clears the busy state without deleting the prompt or transcript.
- Short composer input remains compact and long input grows downward.
- Activity and composer remain readable in light/dark themes and at the minimum supported window.
- No attachment, approval, or background capability appears as a false affordance.

## Official sources

- [Grok Bot overview](https://docs.x.ai/grok-bot/overview)
- [Create and manage Bots](https://docs.x.ai/grok-bot/bots)
- [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)
- [Files and results](https://docs.x.ai/grok-bot/files-and-results)
- [Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications)
- [Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)
- [Grok FAQ](https://docs.x.ai/grok/faq)
- [xAI Streaming](https://docs.x.ai/developers/model-capabilities/text/streaming)
- [xAI Function Calling](https://docs.x.ai/developers/tools/function-calling)
- [xAI Citations](https://docs.x.ai/developers/tools/citations)

