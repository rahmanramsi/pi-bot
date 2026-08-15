# Pi Bot interaction design contract

This contract extends [`docs/design-system.md`](docs/design-system.md) with the rules for motion. Motion should help a person understand what changed, where an action landed, and whether the interface is ready for the next action. It is not decoration.

## 1. Motion principles

- Animate state changes that need orientation: panels, navigation, disclosures, new transcript rows, and status changes.
- Keep direct manipulation immediate. Press feedback is short; it must not delay the action.
- Prefer opacity and transform. Use Motion layout animation for reflow instead of animating width, height, top, left, or other layout properties directly.
- Keep one visual idea per transition. Avoid stacking CSS keyframes and Motion animation on the same element.
- Every nonessential animation respects the operating-system reduced-motion preference. The reduced path keeps state changes understandable with opacity, color, or an immediate update.
- Do not loop decorative motion. The only repeating motion is feedback that communicates an active process, such as the assistant working indicator.

## 2. Timing and easing tokens

| Token | Value | Use |
| --- | --- | --- |
| `--motion-micro` | `120ms ease-out` | press, hover lift, icon swap |
| `--motion-standard` | `220ms cubic-bezier(.2,.8,.2,1)` | disclosure, navigation, panel entry |
| `--motion-emphasis` | `360ms cubic-bezier(.16,1,.3,1)` | workspace and view transitions |
| `--motion-stream-batch` | `40ms` | coalesce assistant text deltas before a markdown render |
| `--motion-stream-caret` | `1100ms ease-in-out` | active-generation caret pulse |

Motion spring equivalents live in `src/lib/motion.tsx`:

- `press`: stiff and brief for tactile controls.
- `layout`: soft enough to preserve spatial continuity during reflow.
- `panel`: damped entry for drawers and workspace surfaces.

## 3. Component contracts

| Surface | Rest | Enter/update | Exit | Required cue |
| --- | --- | --- | --- | --- |
| Shared `Button` | stable | subtle hover lift and press compression | none | focus ring remains visible |
| Agent/session navigation | selected state | active indicator uses shared layout | old indicator leaves with the layout transition | selection is still clear without motion |
| Chat message/activity row | stable reading position | fade and translate a small distance | fade out only when removed | transcript order never changes |
| Disclosure/details | native closed/open state | content fades in; use layout only when spatial continuity is needed | native details closes immediately unless an explicit exit is visible | `summary` remains keyboard native |
| Workspace panel | closed/open state | panel moves in with the control | panel moves out while its state remains announced | no direct width/height animation |
| Dialog/auth prompt | modal surface | fade and rise slightly | fade and lower slightly | focus and escape behavior remain unchanged |
| Async status | compact indicator | opacity/transform communicates working | immediate when complete | no distracting infinite decoration |

## 4. Implementation rules

- Import Motion only through the shared `src/lib/motion.tsx` boundary.
- Render the app inside `MotionConfig reducedMotion="user"`.
- Use `AnimatePresence` for conditional UI that has a meaningful exit, including sidebars, panels, banners, and status rows.
- Use `layout` or `layoutId` for shared spatial continuity. Do not animate `width`, `height`, `top`, `right`, `bottom`, `left`, `margin`, or `padding` with Motion.
- Use `whileHover` and `whileTap` only on actionable controls. Do not animate text or decorative surfaces on hover.
- Keep hover/press transforms below a perceptual nudge: a one-pixel lift or a small scale change is enough.
- Use `useReducedMotion` when a custom animation needs an explicit opacity-only variant; do not invent a second preference mechanism.
- CSS transitions remain appropriate for color, border, and focus changes. A component must have one owner for transform/opacity animation.

## 5. Accessibility and human factors

- Motion is supplementary. Labels, focus, disabled state, selection, and status must remain understandable when animation is removed.
- Respect `prefers-reduced-motion: reduce` through Motion's user policy and the CSS fallback for browser-native animation.
- Never use motion to conceal an error, delay a destructive action, or create an unexpected focus jump.
- Keep transitions brief enough that a person can continue working without waiting for an effect.
- Make cancellation and stop controls respond immediately, even while an enter/exit transition is running.
- Streamed assistant text is rendered in short batches instead of animating each character. This keeps markdown structure stable and leaves the caret as the only repeating cue for active generation.

## 6. Review gate

Before shipping an interaction change, check:

1. The state change is observable at rest, mid-transition, and settled.
2. The reduced-motion path has no transform/layout motion and no decorative loop.
3. Keyboard focus, Escape, native details/select behavior, and screen-reader names are unchanged.
4. Repeated actions do not accumulate stale elements or layout jumps.
5. The interaction remains calm at 375px, 768px, and 1280px viewports where the surface is supported.

## 7. Research basis

This contract follows the Motion React accessibility guidance, Apple Human Interface Guidelines motion guidance, and WCAG 2.2 Success Criterion 2.3.3. The links are kept here so future changes can re-check the source guidance:

- [Motion React accessibility](https://motion.dev/docs/react-accessibility)
- [Apple Human Interface Guidelines: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [W3C WCAG 2.2: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
