# Pi Bot design system

Status: implemented in the current Electron prototype.

## Purpose

The design system keeps agent navigation, sessions, chat, activity, settings, setup, and provider authentication visually consistent. It is intentionally small: semantic CSS tokens plus shared React primitives, not a separate component package.

Source of truth:

- [`src/styles.css`](../src/styles.css) for color, typography, spacing, surfaces, layout, and state styling.
- [`src/components/ui/`](../src/components/ui) for Button, Input, Textarea, Select, Badge, Dialog, and Tooltip primitives.

## Visual hierarchy

The application should be read in this order:

1. Active agent or active session.
2. Conversation, activity, or editable settings content.
3. Primary action.
4. Metadata such as time, context usage, workspace type, and lifecycle notes.

Size alone must not carry the full hierarchy. Weight, contrast, placement, and grouping communicate priority as well.

## Typography roles

All interface text maps to a semantic token:

| Token | Size | Use |
| --- | ---: | --- |
| `--text-caption` | 11px | timestamps, counts, paths, outcomes, secondary metadata |
| `--text-label` | 12px | field labels, compact descriptions, model controls |
| `--text-body` | 14px | messages, descriptions, settings content |
| `--text-control` | 14px | buttons, inputs, selects, textarea content |
| `--text-subheading` | 17px | compact section or sidebar headings |
| `--text-heading` | 21px | page, chat, and agent headings |
| `--text-display` | 28px | first-run/setup headline |

Body text and controls deliberately share the same base size. A button differs through weight, surface, and action priority—not an unrelated font size.

## Layout contract

- Agent rail: always visible at `72px`; it is not collapsible.
- Session sidebar: `280px` normally and `252px` on narrower supported windows; it may be collapsed.
- Main workspace: fills the remaining width and shows either chat or App Settings.
- No permanent right-side Context panel.
- Minimum supported window: `1000 × 700`.

The active agent avatar must use the same initials and deterministic color in the rail, settings, chat messages, and working state.

## Themes and surfaces

Dark and light themes use the same semantic color roles: background, foreground, card, muted, accent, destructive, border, input, ring, shell, rail, sidebar, and raised surface.

Theme rules:

- Neutrals carry the structure.
- Agent colors identify agents; they do not represent status.
- Destructive color is reserved for irreversible actions and failures.
- In light mode, the chat canvas is pure white while shell and sidebars remain slightly tinted.
- Focus is always visible through the shared ring token.

The selected theme is stored in local storage under `pi-bot-theme`.

## Component rules

### Buttons and form controls

- Use shared primitives from `src/components/ui` instead of styling a new button/input locally.
- Default body and control text are both 14px.
- Primary actions use the primary surface; secondary actions use outline or ghost; permanent deletion uses destructive.
- Disabled, hover, pressed, and focus-visible states must remain distinguishable.

### Conversation

- User messages are right-aligned and agent messages are left-aligned.
- Agent responses use the same avatar identity as the active agent rail item.
- Markdown keeps a comfortable line height and a constrained reading width.
- Streaming updates one assistant message instead of creating one row per delta.

### Agent activity

- Tool and status events stay in transcript order but are visually separate from conversation messages.
- Consecutive events are grouped under **Agent activity**.
- Collapsed command rows begin with `Ran` and show the executed command.
- Expanded command rows show `Shell`, the full `$ command`, output, and Success/Failed/Running state.
- Activity details use compact type without becoming smaller than the caption token.

### Composer

- Compact at rest.
- Autosizes vertically for longer text and stops growing at `150px`.
- Model, reasoning level, context usage, and Send/Stop remain available in the bottom toolbar.
- Placeholder text and metadata are secondary; the typed message remains the primary content.

## Accessibility floor

- Normal body and control text use 14px.
- Important state is never communicated by color alone.
- Interactive elements expose accessible names.
- Keyboard focus uses a visible outline.
- Reduced-motion preferences disable nonessential working-state animation.
- Disclosure rows use native `details`/`summary` behavior where appropriate.

## Review checklist

- Does every text element map to one typography role?
- Do repeated buttons and fields use shared primitives?
- Is the active agent identity consistent across surfaces?
- Are conversation and activity visually distinct but chronologically intact?
- Are commands visible without opening the detail, with full output available after expansion?
- Does the composer remain compact with short text and grow with long text?
- Do light and dark modes preserve hierarchy and contrast?
- Can the UI be understood at the minimum supported window size?

