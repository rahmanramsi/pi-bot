# Grok Bot research for Pi Bot

Research date: 2026-08-12  
Pi Bot implementation review: 2026-08-14

This note records the first-party Grok Bot product research that informed Pi Bot's interaction model. External product claims remain a dated research snapshot. Pi-specific status is updated against the current repository.

## Decision summary

Grok Bot is a cloud agent product, not only a chat interface. xAI documents durable named Bots, persistent cloud computers, connected tools, background work, files/results, approvals, groups, and handoffs ([overview](https://docs.x.ai/grok-bot/overview), [FAQ](https://docs.x.ai/grok-bot/faq)).

Pi Bot intentionally keeps a smaller local desktop contract:

- Local Electron main-process runtime with a context-isolated renderer.
- User-created agents with separate workspaces, instructions, models, and sessions.
- No Pi Bot account, cloud sync, team collaboration, background work, or handoffs.
- Provider authentication is local to the application.
- The current runtime does have read, shell, edit, and write tools; therefore permission policy is the next safety priority.

The responsible reuse is the interaction contract—named agents, visible work, inspectable activity, and explicit boundaries—not Grok's cloud execution model or brand.

## Evidence labels

- **Verified** — stated in an official xAI/Grok or X page linked to the claim.
- **Inference** — a design implication, not a claim about hidden Grok implementation.
- **Recommendation** — a scoped proposal for Pi Bot; not shipped unless listed in the current baseline.

The external pages were retrieved on 2026-08-12. Their current availability and behavior may change.

## Grok Bot patterns verified in the original research

### Durable named agents

A Bot has a name, focused job, conversation, and working context. xAI recommends explicit ownership, sources/tools, working style, approval boundaries, and schedules where relevant ([Bots](https://docs.x.ai/grok-bot/bots), [get started](https://docs.x.ai/grok-bot/get-started)).

### Persistent computer and background work

Grok Bot runs on a persistent cloud VM with browser, filesystem, terminal, connectors, and computer use. Work can continue after the client closes ([overview](https://docs.x.ai/grok-bot/overview), [computer and apps](https://docs.x.ai/grok-bot/computer-and-apps), [FAQ](https://docs.x.ai/grok-bot/faq)).

### Messaging and inspectable results

Users message a teammate while the transcript can expose tool activity, computer use, files, questions, and approval requests. Files and tool results can appear as previewable cards ([chat and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration), [files and results](https://docs.x.ai/grok-bot/files-and-results)).

### Skills, routines, groups, and handoffs

Grok documents reusable skills, scheduled/event-triggered routines, groups, and asynchronous Bot-to-Bot handoffs ([skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations), [chat and collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)).

### Approval and recovery

Consequential actions can stop for scoped approval. Attention, errors, and recovery are visible product states rather than hidden runtime details ([approvals and security](https://docs.x.ai/grok-bot/approvals-security-and-privacy), [settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications), [troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)).

## Feature map for current Pi Bot

| Surface | Useful Grok pattern | Current Pi Bot status |
| --- | --- | --- |
| Agent roster | Durable named teammates with explicit jobs. | **Implemented differently:** create/edit/archive/restore/delete agent profiles; permanent left rail; instructions live in each workspace's `AGENTS.md`. |
| Agent workspace | Durable context separated from one-off prompts. | **Implemented locally:** one app-owned or external workspace per agent; `.agents/skills` load only after trust. |
| Composer | Input exposes only valid next actions. | **Implemented:** compact autosizing text composer, model/reasoning controls, Send/Stop; no fake attachment affordance. |
| Transcript | Messages coexist with inspectable tool activity. | **Implemented:** right/left conversation rails and one flat `Working for …` disclosure with visible commands, output, and status. |
| History | Durable conversations have explicit scope. | **Implemented:** Pi `SessionManager` history scoped by agent and workspace. |
| Provider/model | Agent capability should be discoverable. | **Implemented:** local provider setup, cancellable sign-in prompts, global credentials, agent default model, and session model. |
| Skills | Reusable methods require visible scope. | **Partially implemented:** trusted workspace skills can load from `.agents/skills`; no skill-management UI, routines, or scheduler. |
| Approval | Consequential actions stop before execution. | **Not implemented:** current `bash`, `edit`, and `write` tools have no allow/ask/deny gate. |
| Attention | Ready/working/error/needs-input are distinct. | **Partial:** working and error exist; no durable needs-input queue or background execution. |
| Handoffs/background | Delegation has ownership and history. | **Deferred:** no subagents, groups, handoffs, schedules, or work after app close. |
| Browser/connectors | External capability has a credential and sandbox boundary. | **Deferred:** no browser/computer use, MCP, or connectors. |

## Current architecture baseline

- [`electron/main.mjs`](../electron/main.mjs) owns model discovery, provider authentication, credential storage, agents, workspaces, skills, Pi sessions, tool events, and persistence.
- Pi is created with `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls`.
- Extensions, implicit context files, prompt templates, and Pi runtime themes are disabled.
- [`electron/preload.cjs`](../electron/preload.cjs) exposes the narrow `window.piBot` IPC API; the renderer has no direct Node access.
- [`src/App.tsx`](../src/App.tsx) provides the combined collapsible agent/session sidebar, chat, activity, composer, settings, provider setup, and provider prompt cancellation.
- [`src/styles.css`](../src/styles.css) provides light/dark themes and semantic design tokens documented in [design-system.md](design-system.md).
- Agent/session data remains local under Electron user data. There is no cloud account or sync layer.

See [mvp-spec.md](mvp-spec.md) for the shipped contract and [next-stage-spec.md](next-stage-spec.md) for planned safety work.

## Recommendations

### P0 — permission before more capability

1. Add explicit allow/ask/deny policy for each tool and relevant resource scope.
2. Show shell command, target, and expected effect before approval.
3. Keep approved, denied, cancelled, succeeded, and failed actions in the same activity trail.
4. Decide whether host execution remains acceptable or a sandbox is required.

OpenCode, Codex, Claude Code, Zed, Cline, and Kilo are more relevant permission references than copying Grok's cloud VM model; see [agent-harness-catalog.md](agent-harness-catalog.md).

### P1 — clearer attention and evidence

- Add real Ready, Working, Error, and Needs input semantics without implying background execution.
- Add retry/reconnect actions only for recoverable runtime failures.
- Keep visible evidence grounded in actual commands, output, paths, or source links.
- Add artifact metadata only when the runtime provides the underlying artifact.

### Deferred

- Attachments, URL/web search, connectors, MCP, browser/computer use.
- Subagents, groups, mentions, handoffs, parallel or background agents.
- Skills management, routines, event triggers, and notifications while closed.
- Cloud session/memory sync, accounts, billing, and collaboration.

Each item changes persistence, credentials, cancellation, auditability, or the threat model. It is not a cosmetic UI toggle.

## Responsible imitation boundaries

### Safe to reuse

- Named agents with clear durable instructions.
- A roster that communicates identity and current state.
- A composer that exposes only supported actions.
- A chronological transcript with inspectable tool activity and failures.
- Explicit scope, recovery, and approval boundaries.
- Agent-scoped local history.

### Do not imply or copy

- Do not claim a persistent cloud computer, work while closed, cross-device sync, shared memory, connectors, or handoffs.
- Do not describe the runtime as read-only; it currently includes shell and file-write tools.
- Do not claim sandboxing or approval before they exist.
- Do not treat separate local agents as a security boundary if future shared credentials/state are introduced.
- Do not copy Grok names, logos, avatars, screenshots, or brand voice.
- Do not present hidden chain-of-thought as evidence.

## Primary sources from the research snapshot

- [Grok Bot overview](https://docs.x.ai/grok-bot/overview)
- [Grok Bot get started](https://docs.x.ai/grok-bot/get-started)
- [Create and manage Bots](https://docs.x.ai/grok-bot/bots)
- [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)
- [Files and results](https://docs.x.ai/grok-bot/files-and-results)
- [Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)
- [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- [Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications)
- [Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- [Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)
- [Grok Bot FAQ](https://docs.x.ai/grok-bot/faq)
- [Introducing Grok Build](https://x.ai/news/grok-build-cli)
- [Grok Build](https://x.ai/cli)
