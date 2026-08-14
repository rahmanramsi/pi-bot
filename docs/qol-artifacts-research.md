# QoL research: results that an AI creates

Research date: 2026-08-14  
Status: recommendation only; no application behavior has changed.

## Product boundary

Pi Bot is for general users, not programmers. A user should think in terms of a result—"my invitation", "the budget sheet", "the image", or "the website draft"—not paths, diffs, tool calls, or a repository.

Tool activity remains useful as a secondary, inspectable audit trail. It is not the main experience.

## Decision

Build **Hasil dibuat** first: a friendly result card for every completed agent turn.

This answers the question a general user has immediately after the AI works: *what is ready, can I see it, and how do I ask for a revision?*

The first version should identify the result in plain language, show a preview when supported, and offer three actions:

1. **Lihat** — open the preview or the macOS default application.
2. **Buka di Finder** — an escape hatch, not the primary action.
3. **Ubah hasil ini** — prefill the next prompt with a reference to that result.

The card should say, for example, "Presentasi 8 slide siap ditinjau" or "Website draft siap dibuka", rather than showing `/Users/.../draft.html`. Internally, only show results whose paths came from actual `write` and `edit` tool-call arguments. Resolve them against the active workspace and reject paths outside it before exposing an action.

## Why this is the best first QoL feature

Pi Bot already receives the tool name, input arguments, result, and success state for every tool execution. It currently presents these as expandable activity rows, so the missing part is a result-oriented presentation and safe native actions, not a new agent capability.

Official Codex documentation validates the interaction pattern: generated files can be opened automatically after a task, HTML can have rendered and source views, and review annotations can drive a targeted follow-up. The same documentation notes that CLI-oriented agents should report output paths and validation performed when they cannot provide a visual preview. Pi Bot can close this gap in its desktop UI without building a full editor.

## Ranked backlog

| Priority | Feature | User result | Smallest useful scope |
| --- | --- | --- | --- |
| P0 | Hasil dibuat | See, open, and revise the result without locating a file | Derive output files from successful `write` and `edit`; friendly title, preview if supported, Lihat / Buka di Finder / Ubah hasil ini |
| P1 | Revision loop | Improve the result without explaining its location again | Keep the selected result attached to the next message; offer suggestions such as "buat lebih singkat" or "ganti warna" based on its type |
| P1 | Visual preview | Review websites, images, PDFs, and documents where the conversation happens | Inline preview for HTML, images, and PDFs; open the default app for other formats |
| P1 | Simple version history | Return to an earlier result when a revision is worse | Keep named result versions per conversation; let the user reopen or duplicate a prior version, never silently overwrite it |
| P2 | Recent results | Return to past work without knowing where it was saved | A visual Recent results list by conversation, with thumbnail/type icon and friendly name |
| P2 | Source materials | Let users give the AI a document, image, or spreadsheet as input | Drag and drop, visible upload state, and a clear list of the materials used for a result |
| P3 | Completion notification | Return only when work needs attention | Native notification for success/failure after the app loses focus; never imply background execution while Pi Bot remains foreground-only |

## Explicit non-goals for the first release

- No programming-first file explorer, terminal, Git diff, editor, or arbitrary path browser in the primary UI.
- No automatic opening of every output; opening should be user initiated.
- No hidden overwrite. A revision should become a new visible version.
- No parsing `bash` output for results, because a command can print untrusted or unrelated paths.
- No preview for arbitrary executable or unsupported file types.

## Implementation shape

1. Extend the internal timeline/tool data with structured result metadata: `path`, `operation`, type, friendly title, and tool-call id. Keep the raw tool activity unchanged.
2. At `tool_execution_end`, extract the explicit file argument only for successful `write` or `edit` calls. Canonicalize it and ensure it is inside the active workspace.
3. Add narrow preload methods: `openArtifact(path)`, `revealArtifact(path)`, and `copyArtifactPath(path)`. Main-process handlers repeat the workspace-boundary check before using Electron's `shell` APIs.
4. Render a compact **Hasil dibuat** card after the agent answer. Use type-aware labels and previews; disclose the path only in a secondary details view.
5. A revision starts a new result version and keeps the previous version reachable. Add unit tests for relative paths, absolute in-workspace paths, `..` traversal, symlinks, deleted files, and external-workspace switching. Add a manual macOS smoke case for Lihat and Buka di Finder.

The existing activity structure makes this a contained change in `electron/main.mjs`, `electron/preload.cjs`, `src/types.ts`, and `src/App.tsx`. It should not require new provider, Pi SDK, or renderer Node privileges.

## Related safety work

The product still has no per-action approval policy while `bash`, `edit`, and `write` are enabled. That is a separate P0 safety requirement and should be delivered before making the agent more autonomous. Artifact review adds transparency; it does not make unrestricted writes safe.

## Evidence

- Pi Bot records `tool_execution_start`, `tool_execution_update`, and `tool_execution_end`, including arguments and results, in [`electron/main.mjs`](../electron/main.mjs); the renderer presents them as activity items in [`src/App.tsx`](../src/App.tsx).
- The bridge presently exposes only session/agent/runtime operations; it has no native file-open capability: [`electron/preload.cjs`](../electron/preload.cjs).
- [`README.md`](../README.md) states that `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls` run without per-action approval or sandboxing.
- OpenAI's [Work with files documentation](https://learn.chatgpt.com/docs/artifacts-viewer) describes automatic generated-file opening, interactive HTML previews with a source/rendered switch, and focused revisions through annotations. It also states that Codex CLI has no visual preview and should report output paths and checks.
- The prior harness comparison in [`agent-harness-catalog.md`](agent-harness-catalog.md) identifies permission/approval, history/context, and artifact-oriented workflows as high-value themes; [`chat-ux-research.md`](chat-ux-research.md) records the related current gap: path/artifact metadata must only be added when tool events actually supply it.
