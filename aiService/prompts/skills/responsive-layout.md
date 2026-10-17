description: Layouts that work from 320px phones to wide desktops: mobile-first CSS, flex/grid, breakpoints, touch targets, no horizontal scroll.

# Responsive layout

## Mobile first

- Write the base styles for a ~360px wide phone, then add `min-width` media queries (or Tailwind
  `sm: md: lg:` prefixes) to enhance for larger screens. Never the other way around.
- Common breakpoints: 640px, 768px, 1024px, 1280px. Add one only where the layout actually breaks.
- Always include `<meta name="viewport" content="width=device-width, initial-scale=1">`
  (Next.js adds it for you).

## Layout tools

- Flexbox for one direction (nav bars, rows of buttons, media objects); Grid for two
  (card grids, page shells, forms with aligned labels).
- Card grids without media queries: `grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr))`.
- Constrain content width: a centered container `max-width: 72rem; margin-inline: auto;
padding-inline: 1rem` (more padding on larger screens).
- Use `gap` instead of margins between flex/grid children.

## Never overflow

- No fixed widths on content (`width: 600px`); use `max-width` and percentages / `min()`.
- Long words, URLs and code: `overflow-wrap: anywhere` or `min-width: 0` on flex/grid children
  that contain text (the classic cause of horizontal scroll).
- Images and media: `max-width: 100%; height: auto;`.
- Tables: wrap in a container with `overflow-x: auto` on small screens.
- Test at 320px wide: nothing may scroll sideways.

## Touch and sizing

- Tap targets at least 44x44px with space between them.
- Inputs at least 16px font size on mobile (smaller makes iOS zoom in on focus).
- Navigation: a compact header with a menu button on phones, the full nav from `md` up. The menu
  must be keyboard accessible and close on Escape / link click.
- Use `min-height: 100svh` (not `100vh`) for full-screen sections so mobile browser bars do not cut content.

## Fluid touches

- Fluid type for big headings: `font-size: clamp(2rem, 5vw + 1rem, 4rem)`.
- Stack side-by-side layouts on phones (text above image), reorder only with CSS that keeps the
  DOM order logical for screen readers.
