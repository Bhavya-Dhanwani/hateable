description: Accessible UI: semantic HTML, labels, keyboard and focus, contrast, images, forms, ARIA only where needed.

# Accessibility

Accessible UI is also better UI: it is what makes forms usable, navigation predictable and
content readable for everyone.

## Semantic HTML first

- Use the right element: `<button>` for actions, `<a href>` for navigation, `<nav>`, `<main>`,
  `<header>`, `<footer>`, `<section>` with a heading, `<ul>/<li>` for lists, `<table>` for tabular data.
- Never a clickable `<div>` or `<span>`. If it does something on click, it is a `<button type="button">`.
- One `<h1>` per page and heading levels in order (h1 > h2 > h3), never chosen for their size.
- `<html lang="...">` set (Next.js: in the root layout).

## Keyboard and focus

- Everything usable with a mouse is usable with Tab / Shift+Tab / Enter / Space / Escape.
- Never remove focus outlines without a replacement: style `:focus-visible` clearly
  (e.g. a 2px outline in the accent color with an offset).
- Dialogs and menus: move focus into them when opened, close on Escape, return focus to the
  trigger when closed. Prefer the native `<dialog>` element.
- Do not create keyboard traps or use positive `tabindex` values.

## Forms

- Every input has a visible `<label for>` (placeholders are not labels).
- Group related inputs with `<fieldset>` + `<legend>` (radio groups, addresses).
- Errors: shown next to the field in text (not only red color), linked with `aria-describedby`,
  and announced (`role="alert"` or an `aria-live="polite"` region). Keep the user's input on error.
- Use the right `type` and `autocomplete` (`email`, `tel`, `current-password`, `name`...).

## Images and media

- Meaningful images: `alt` describing what matters in context. Decorative images: `alt=""`.
- Icon-only buttons need an accessible name: `aria-label="Close"` (and a `title` tooltip helps sighted users).
- Video: captions; never autoplay with sound.

## Color and motion

- Text contrast 4.5:1 (3:1 for large text and UI component borders).
- Never use color alone to convey meaning: pair it with text or an icon (error, success, required).
- Respect `prefers-reduced-motion: reduce` by disabling non-essential animation.

## ARIA

- No ARIA is better than bad ARIA. Use it only to fill real gaps: `aria-expanded` on disclosure
  buttons, `aria-current="page"` on the active nav link, `aria-live` for async status messages,
  `aria-label` for icon-only controls.
