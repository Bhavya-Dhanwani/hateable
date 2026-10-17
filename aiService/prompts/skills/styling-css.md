description: Styling that stays maintainable: match the project's approach (plain CSS or Tailwind), design tokens, modern CSS, no conflicts.

# Styling

## First, match the project

- Look at what the project already uses and stay with it: Tailwind classes (Next.js boilerplates,
  `tailwind` in package.json / `@import "tailwindcss"` in the global CSS) or plain CSS files
  (React/Vite boilerplates: `App.css`, `index.css`). Never mix in a second styling system,
  and never add a UI library the task did not ask for.

## Design tokens

- Put colors, radii, shadows, fonts and the spacing scale in one place and reuse them:
  - plain CSS: custom properties on `:root` (`--color-accent`, `--radius-md`, `--space-4`)
  - Tailwind v4: an `@theme { ... }` block in the global CSS; Tailwind v3: `tailwind.config`
- Components use tokens, never one-off hex values.
- Dark mode, if asked: redefine the same tokens under `@media (prefers-color-scheme: dark)` or a
  `.dark` class; components do not change.

## Plain CSS

- Scope styles to the component: a class per component (`.pricing-card`, `.pricing-card__price`)
  or CSS Modules (`Card.module.css`) if the project uses them. No styling bare tags globally
  except a small reset/base (body, headings, links, `box-sizing: border-box`).
- Avoid `!important` and ID selectors; keep specificity flat.
- Use modern CSS: flex/grid with `gap`, `clamp()` for fluid sizes, `aspect-ratio`, logical
  properties (`margin-inline`, `padding-block`), `:focus-visible`, `@media (prefers-reduced-motion)`.

## Tailwind

- Use theme tokens and the default scale (`p-4`, `gap-6`, `text-lg`); avoid arbitrary values
  (`p-[13px]`) except for one-off needs.
- Keep class lists readable: layout > box > typography > color > state, and extract a component
  (not `@apply`) when the same long class list repeats.
- Responsive and state variants instead of custom CSS: `md:grid-cols-3`, `hover:`, `focus-visible:`,
  `disabled:`, `aria-[expanded=true]:`.

## Always

- Every interactive element has visible hover, focus-visible, active and disabled styles.
- Transitions only on `opacity`, `transform`, `color`, `background-color`, `border-color`,
  `box-shadow` (cheap to animate), 150-250ms.
- Fonts: load with `font-display: swap` (Next.js: `next/font`), and give a sensible system fallback stack.
