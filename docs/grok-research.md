# Grok Bot research for Pi Bot

Research date: 2026-08-12

This note investigates the first-party Grok Bot product and the adjacent Grok/Grok Build surfaces that xAI documents. It separates verified product behavior from design inferences and recommendations for this repository. No application code was changed.

## Decision summary

Grok Bot is a cloud agent product, not just a chat screen. xAI describes each Bot as a durable, named teammate with a job, its own conversation, persistent working context, access to a shared cloud computer, connected tools, and the ability to continue work in the background and hand work to other Bots ([Grok Bot overview](https://docs.x.ai/grok-bot/overview), [Grok Bot FAQ](https://docs.x.ai/grok-bot/faq)).

Pi Bot deliberately has a smaller contract: a local Electron app with three fixed roles, one persistent read-only Pi session per role/workspace, no cloud sync, no account layer, no writes, no shell, no browser, and no automatic multi-agent orchestration ([MVP scope and non-goals](mvp-spec.md)). The responsible reuse is therefore the *interaction model*, not Grok Bot's cloud execution model or brand voice.

Recommended direction for Pi Bot:

1. Keep the current local/read-only boundary as the product promise.
2. Make each role's job, source scope, and capability boundary more visible in the UI.
3. Keep the timeline legible as a reviewable work log: assistant result, tool activity, status, error, and (later) evidence/inference labels.
4. Add attention-oriented states and actionable errors before adding new powers.
5. Treat groups, handoffs, skills, routines, connectors, attachments, and write approvals as later products with separate security decisions—not as cosmetic Grok features.

## Evidence labels

- **Verified** means the behavior is stated in an official xAI/Grok or X help page linked next to the claim.
- **Inference** is a design implication drawn from one or more verified behaviors; it is not a claim about hidden implementation.
- **Recommendation** is a concrete, scoped suggestion for Pi Bot.

The xAI pages used here were retrieved on 2026-08-12 and mostly show “Last updated: August 11, 2026.” Product behavior and availability can change; the linked pages are the source of truth.

## What Grok Bot is (verified)

### Durable, named roles

A Bot has a name, a job, its own conversation, and working context that develops over time. xAI recommends a focused operational role with explicit ownership, tools/sources, working style, approval boundary, and (when relevant) schedule; it says a vague “General Helper” role is less reusable ([Create and manage Bots](https://docs.x.ai/grok-bot/bots)).

The onboarding flow asks for an outcome, sources, constraints, deliverable, and review point. The Bot profile holds durable rules; the conversation carries task-specific instructions ([Get started](https://docs.x.ai/grok-bot/get-started), [Create and manage Bots](https://docs.x.ai/grok-bot/bots)).

### Persistent cloud computer and background work

Each Bot runs on a persistent cloud VM with a browser, filesystem, and terminal. It can use connectors/MCP and computer use for sites without a clean API; work can continue when the desktop, laptop, or iPhone is closed ([Grok Bot overview](https://docs.x.ai/grok-bot/overview), [Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps), [Grok Bot FAQ](https://docs.x.ai/grok-bot/faq)).

All Bots for one account share that account's persistent computer, including files, browser sessions, and command-line credentials. xAI explicitly warns that separate Bots are not a security boundary. Bots get separate screens for parallel computer-use work, but the underlying data boundary is shared ([Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps), [Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).

### Messaging-style work surface

The documented interaction is “message a teammate”: paste text, links, or images; attach local files; reference a saved skill with `/`; mention a Bot, group, routine, or connector with `@`; reply in a thread; react; and send another instruction while work is in progress. The transcript can show tool activity, computer use, created files, questions, and approval requests beside ordinary messages ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)).

The user can redirect work with a new message or send “Stop now.” Stopping does not undo actions already completed ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)).

### Collaboration and handoffs

Groups contain two to six Bots. Users can direct a message with `@`, mention multiple Bots when each is needed, or let the participants decide who responds. Bots can send asynchronous messages to one another; the receiving Bot wakes, handles the request, and replies later. The docs recommend one owner per stage because too many handoffs create duplicate work and noisy updates ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)).

### Files, links, and reviewable results

The desktop composer accepts up to six attachments at a time; xAI documents common inputs including images, audio/video, PDFs, Office files, structured data, source code, HTML/email files, and notebooks. Files, links, images, and tool results appear as cards that can be previewed and revised in the same conversation ([Files and results](https://docs.x.ai/grok-bot/files-and-results)).

For consequential work, xAI recommends separating facts found in source systems, assumptions/inferences, actions already completed, actions awaiting approval, and unresolved questions. It also recommends specifying the expected artifact and acceptance criteria ([Files and results](https://docs.x.ai/grok-bot/files-and-results)).

### Skills and routines

A **skill** is reusable instructions for how to perform a task. A **routine** tells one Bot when to run that workflow, on a schedule or (where supported) after an event. xAI's sequence is: perform a one-time task, make it reliable, save the method as a skill, then automate it. Skills capture inputs, steps, validation, output, and safety boundaries ([Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)).

Routines can run while a laptop is closed. The docs require testing with safe inputs and warn that a test run can perform real work, navigate sites, change files, or call connected tools ([Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)).

### Approval and safety model

Grok Bot expects explicit boundaries around sending, publishing, purchases, deletion/overwrite, permission changes, production changes, and legal acceptance. An approval controls a proposed action; it does not reverse work already completed. The conversation shows the proposed operation and inputs, with Allow once/Deny controls; “Require Approval” wins over “Always Allow” when both match ([Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).

Passwords, passkeys, two-factor codes, CAPTCHAs, payment confirmations, and similar sensitive steps are handed to the user through computer takeover rather than ordinary chat. xAI also recommends narrow least-privilege rules and says model-based Auto Review complements, rather than replaces, explicit boundaries ([Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps), [Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).

### Attention, notifications, and recovery

The Bot list distinguishes “Needs attention” (question, approval, or handoff), unread activity, and working/typing status. Per-Bot notifications can alert when a Bot finishes or needs input; errors appear above the composer and can include a request ID for support ([Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications)).

The troubleshooting guidance favors the least destructive recovery first: inspect the current status, look for a question/approval/login/CAPTCHA, redirect or stop, and only then restart or recover the computer. Durable files and logins are distinguished from recent unsynced work that can be lost by a reset ([Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)).

## Adjacent first-party surfaces (verified, not Grok Bot)

These products are useful interaction references but should not be conflated with Grok Bot:

- **Grok Chat** combines chat, live web/𝕏 search, reasoning, voice, file/PDF analysis, memory, canvas, and shareable conversations. It advertises follow-up questions and citations from live sources ([Grok product page](https://x.ai/grok), [Welcome to Grok](https://docs.x.ai/grok/overview)).
- **Grok Build** is xAI's coding agent/CLI. Its documented plan mode blocks edits until approval and then shows a clean diff; it also advertises parallel subagents, skills, hooks, MCP, memory, code search, tests, and sandboxed execution ([Introducing Grok Build](https://x.ai/news/grok-build-cli), [Grok Build](https://x.ai/cli)). These are coding-agent patterns, not evidence that Pi Bot should gain writes or orchestration.
- **Grok on X** can decide whether to search public X posts and the live web in response to text or voice input; X's help page also documents training/personalization controls and warns users not to share sensitive information ([About Grok on X](https://help.x.com/en/using-x/about-grok)). This is relevant to provenance/privacy language, not to Pi Bot's local workspace tool contract.

## Feature and interaction map

| Surface | Grok Bot behavior (verified) | UX pattern inferred | Pi Bot application |
| --- | --- | --- | --- |
| Agent roster | Sidebar lists durable Bots; users can create, edit, pin, hide, and search them ([Create and manage Bots](https://docs.x.ai/grok-bot/bots), [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)). | The roster is a work queue, not only navigation. | **Now:** keep Planner/Researcher/Coder as the fixed roster, but make role, scope, and capability visible. **Later:** profile editing only if custom agents become an explicit product decision. |
| Attention state | Needs attention, unread, working/typing, and notification controls are distinct ([Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications)). | Users can scan what needs a decision without opening every thread. | **P0 recommendation:** add a small, explicit distinction between Ready, Working, Error, and Needs input; do not imply cloud/background work. |
| Composer | Attachments, links/images, `/` skills, `@` mentions, replies, reactions, and in-progress messages are supported ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration), [Files and results](https://docs.x.ai/grok-bot/files-and-results)). | Input affordances expose the next useful action. | **Now:** retain the simple text composer and Stop action. **Later:** add attachments only with a local data/size/permission design; do not add `/` or `@` as decorative controls. |
| Transcript | Normal messages sit beside tool activity, computer use, files, questions, and approvals ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)). | A work log makes agent behavior inspectable. | **Already aligned:** `TimelineItem` and `PiEvent` expose assistant deltas, tool start/update/end, statuses, and errors ([types.ts](../src/types.ts), [main.mjs](../electron/main.mjs)). Improve labels/grouping before adding new tool power. |
| Role context | Durable Bot descriptions hold standing rules; messages hold one-off instructions ([Create and manage Bots](https://docs.x.ai/grok-bot/bots)). | Separate “how this agent works” from “what I asked this time.” | **Already aligned:** `agentProfiles` hold role descriptions/system prompts ([main.mjs](../electron/main.mjs)). Show the role boundary in Context and keep it distinct from session title. |
| History and memory | Bots retain role context and summaries; conversations, learned role, files, and handoffs have different scopes ([Grok Bot FAQ](https://docs.x.ai/grok-bot/faq)). | Users need to know what is durable versus thread-local. | **Now:** preserve Pi's per-workspace/per-agent `SessionManager` history. **Later:** document any durable preferences separately instead of silently expanding session memory. |
| Tool access | Persistent cloud computer, browser, terminal, files, connectors, and MCP are available ([Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)). | Capability should be discoverable and scoped. | **Do not imitate the backend.** Keep `read`, `grep`, `find`, and `ls` visibly read-only ([main.mjs](../electron/main.mjs), [MVP non-goals](mvp-spec.md)). |
| Results | Cards preview files/links/tool results; output can be revised in place ([Files and results](https://docs.x.ai/grok-bot/files-and-results)). | A result is an inspectable artifact, not a text blob. | **P1 recommendation:** add structured “evidence / inference / unresolved” conventions to assistant output and tool rows without enabling writes. |
| Handoffs | Groups and asynchronous Bot-to-Bot handoffs are visible in the conversation ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)). | Delegation needs an owner and a visible trail. | **Defer:** automatic orchestration and handoffs are explicit Pi MVP non-goals ([mvp-spec.md](mvp-spec.md)). |
| Skills/routines | Skills encode a validated method; routines schedule or event-trigger it; test runs can have real side effects ([Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)). | Automate only after a reviewable one-off process works. | **Defer:** current Pi runtime disables skills/extensions and has no scheduler ([main.mjs](../electron/main.mjs)). If revisited, start with local read-only prompt templates and a visible test run. |
| Approval | Proposed consequential actions show target/scope/inputs and stop for Allow once/Deny; rules are narrow and least-privilege ([Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)). | Make a boundary explicit before adding capability. | **Already aligned:** Pi has no write-capable action to approve. Preserve this simpler invariant; add approvals only when a concrete write tool exists. |
| Errors/recovery | Errors appear above the composer; recovery starts with inspection, redirect, stop, then restart/recover ([Settings and notifications](https://docs.x.ai/grok-bot/settings-and-notifications), [Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)). | Recovery is part of the main interaction, not an afterthought. | **P0 recommendation:** retain the readable error line and make each failure state say what can be retried, stopped, or reconnected. |
| Plan/review | Grok Build blocks edits until a plan is approved and then shows a clean diff ([Introducing Grok Build](https://x.ai/news/grok-build-cli)). | High-impact work benefits from a review gate before execution. | **Already aligned in spirit:** Planner is read-only and Coder cannot claim edits. Do not add edit/diff execution to this MVP. |

## Pi Bot architecture baseline

The current implementation already provides the strongest safe subset of the patterns above:

- The fixed roles and their boundaries live in `agentProfiles`; the enabled tools are exactly `read`, `grep`, `find`, and `ls` ([electron/main.mjs](../electron/main.mjs)).
- Workspace, selected agent, model/thinking preferences, and agent-to-session mappings are persisted locally in Electron user data; Pi's `SessionManager` supplies history ([electron/main.mjs](../electron/main.mjs)).
- The main process constructs the Pi session with read-only tools, disables extensions/skills/context files, and keeps the renderer behind a narrow context-isolated bridge ([electron/main.mjs](../electron/main.mjs), [electron/preload.cjs](../electron/preload.cjs)).
- The renderer already has the key work surfaces: agent sidebar, collapsible history, streaming composer with Stop, event timeline/tool details, context panel, model/thinking controls, and readable error state ([src/App.tsx](../src/App.tsx)).
- The type layer explicitly models assistant deltas, tool lifecycle, agent status, aborts, errors, and session synchronization ([src/types.ts](../src/types.ts)).
- The MVP specification explicitly excludes cloud sync, accounts, billing, team collaboration, writes, shell, browser automation, extensions, automatic orchestration, handoffs, and custom agents ([docs/mvp-spec.md](mvp-spec.md)).

## Actionable recommendations

### P0: improve the existing safe surface

1. **Make role scope first-class in copy.** Keep Planner, Researcher, and Coder, but show each role's job and “may read / may not change” boundary wherever the active role is selected. This follows Grok Bot's distinction between durable role description and one-off task instruction ([Create and manage Bots](https://docs.x.ai/grok-bot/bots)).
2. **Add attention semantics without implying background execution.** Distinguish Ready, Working, Error, and Needs input in the sidebar/header. Pi already has `busy`, `connecting`, and error events; this is a presentation refinement, not a new capability ([src/App.tsx](../src/App.tsx), [src/types.ts](../src/types.ts)).
3. **Make the read-only work log easier to scan.** Keep tool rows collapsible, but group consecutive reads/searches and label the tool purpose plainly. Grok's documented transcript places tool activity beside messages; Pi should do that while preserving local read-only truth ([Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)).
4. **Make recovery actionable.** Every runtime error should say whether the user can retry, stop, change folder, or authenticate Pi. Do not expose generic “something went wrong” when the main process has a specific reason ([Troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)).

### P1: improve reviewability without adding write access

1. **Adopt a response convention:** `Answer`, `Evidence`, `Inference`, and `Open questions` for Researcher; `Plan`, `Assumptions`, and `Risks` for Planner; `Finding`, `Relevant files`, and `Suggested change` for Coder. This is an inference from xAI's recommendation to separate facts, assumptions, actions, approvals, and unresolved questions—not a claim that Pi must copy Grok's output format ([Files and results](https://docs.x.ai/grok-bot/files-and-results)).
2. **Add lightweight result metadata** to timeline rows (for example, source path and line reference when the model returns one) instead of introducing artifact cards or filesystem writes. The user should be able to audit where a read-only answer came from.
3. **Make the context panel a capability contract.** Keep workspace, role, model, thinking level, and tools together; add a short “This session cannot write or run commands” statement near the composer as well as in the context panel.

### Defer until a separate product decision

- Attachments, URL fetching, web/𝕏 search, connectors, MCP, browser control, and local command execution.
- Custom Bot/agent creation, profile editing, groups, `@` mentions, asynchronous handoffs, and parallel agents.
- Skills, routines, event triggers, notifications while the app is closed, and any cloud session/memory sync.
- Write tools, plan approval, diffs, or an Allow/Deny policy engine.

Each item changes the threat model or contradicts an explicit Pi MVP non-goal. Grok's own docs treat these as permissioned surfaces with durable state, shared credentials, approvals, and recovery rules—not as simple UI toggles ([MVP non-goals](mvp-spec.md), [Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).

## Responsible imitation boundaries

### Safe to imitate

- A named role with a clear job and a visible scope.
- A sidebar that communicates current status and attention.
- A composer that makes the next valid action obvious.
- A transcript that exposes tool activity and failures inline.
- Review-oriented output that separates evidence from inference.
- Explicit boundaries, readable errors, and a user-controlled Stop action.
- Searchable, role-scoped local history.

### Do not imply or copy

- Do not claim Pi Bot has a persistent cloud computer, background execution, cross-device sync, connectors, or shared Bot memory; those are Grok Bot capabilities documented by xAI, not Pi capabilities ([Grok Bot overview](https://docs.x.ai/grok-bot/overview), [Grok Bot FAQ](https://docs.x.ai/grok-bot/faq)).
- Do not turn Pi's read-only tools into writes, shell, browser, or arbitrary extensions merely to match Grok's feature list. The current architecture intentionally removes those powers ([MVP non-goals](mvp-spec.md), [main.mjs](../electron/main.mjs)).
- Do not use separate local agents as a security boundary if future shared state is introduced; Grok explicitly warns that its Bots share one computer and credentials ([Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).
- Do not copy xAI/Grok names, logos, avatars, screenshots, or “truth-seeking”/humorous positioning into Pi Bot. The useful object of study here is the interaction contract, not the brand identity.
- Do not present a model's chain-of-thought as an auditable proof. “Evidence” should mean visible source paths, tool output, or user-provided material; “Inference” should be labeled as such.

## Sources

Primary sources used in this report:

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
- [Welcome to Grok](https://docs.x.ai/grok/overview)
- [Grok FAQ](https://docs.x.ai/grok/faq)
- [Grok product page](https://x.ai/grok)
- [About Grok on X](https://help.x.com/en/using-x/about-grok)
- [Introducing Grok Build](https://x.ai/news/grok-build-cli)
- [Grok Build](https://x.ai/cli)

