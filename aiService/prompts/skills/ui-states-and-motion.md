description: The parts that make an app feel finished: loading, empty, error and success states, feedback on every action, and tasteful motion.

# UI states and motion

A screen is only done when every state of it is designed, not just the happy path.

## Every data view has five states

1. **Loading**: skeletons shaped like the content (for lists, cards, tables) or a small spinner
   for short waits. Never a blank screen, never layout jumping when data arrives.
2. **Empty**: a short explanation and the next action ("No projects yet. Create your first one"),
   not just "No data".
3. **Error**: say what went wrong in plain words, keep what the user entered, and offer a way out
   (Retry, Go back). Never show raw stack traces or "[object Object]".
4. **Partial / many**: long lists paginate or load more; long text truncates with a way to see it all.
5. **Success**: the content itself, plus confirmation for actions (toast, inline "Saved", updated item).

## Feedback on actions

- Buttons show progress while working ("Saving..." with a spinner, disabled) and cannot be double-submitted.
- Destructive actions ask for confirmation or offer Undo.
- Optimistic updates for quick, likely-to-succeed actions (toggle, like), with rollback on error.
- Status messages are announced to screen readers (`role="status"` / `aria-live="polite"`).

## Motion

- Motion explains change: things entering, leaving, expanding, reordering. It is never decoration
  for its own sake.
- Durations: 150-250ms for small UI (hover, toggles, menus), 250-400ms for larger panels and page
  elements. Ease-out for entering, ease-in for leaving.
- Animate `transform` and `opacity` only; never `width`, `height`, `top` or `left` in loops.
- Stagger lists subtly (30-60ms per item, cap the total).
- Hover effects: small (translateY(-2px), slight shadow, color shift), never large jumps.
- Always honor `@media (prefers-reduced-motion: reduce)`: disable or shorten non-essential animation.
- Use an existing animation library only if the project already has one; CSS transitions and
  keyframes cover most needs.

## Details people notice

- Disabled states look disabled and explain why when it is not obvious (a tooltip or helper text).
- Forms remember input across validation errors; focus moves to the first invalid field.
- Page titles (`<title>` / Next.js `metadata`) describe the page.
- A custom 404 page that links back home.
