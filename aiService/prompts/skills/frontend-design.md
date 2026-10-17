description: Visual design for any page or component: hierarchy, typography, spacing, color, and making it look designed rather than generated.

# Frontend design

Goal: an interface that looks deliberately designed for this product, not like a default template.

## Start from the content

- Decide what the single most important thing on the screen is (a headline, a number, a primary
  action) and make it unmistakably dominant. Everything else steps down from it.
- Use the project's real subject in copy, examples and data. Never "Lorem ipsum", "Feature 1",
  "John Doe" or "Your text here". Write short, specific, confident copy.

## Typography

- One typeface family is enough; two at most (a display face for headings, a text face for body).
- Use a clear type scale, e.g. 12 / 14 / 16 / 20 / 24 / 32 / 48 px, and stick to it.
- Body text 16px, line-height 1.5-1.7, line length 60-75 characters (`max-width: 65ch`).
- Headings: tighter line-height (1.1-1.25) and slight negative letter-spacing on large sizes.
- Hierarchy through size and weight first, color second. Max 3 font weights on a page.

## Spacing and layout

- Use a spacing scale based on 4 or 8 px (4, 8, 12, 16, 24, 32, 48, 64, 96) everywhere: padding,
  gaps, margins. No arbitrary values like 13px or 37px.
- Group related things tightly and separate groups generously: proximity carries meaning.
- Align everything to a few strong edges. Center only short, symmetrical content (heroes, empty states).
- Give sections real breathing room (64-120px vertical padding on landing pages).

## Color

- Define a small palette as CSS custom properties (or Tailwind theme tokens): background, surface,
  text, muted text, border, one accent, plus success / warning / danger.
- One accent color, used sparingly for the primary action and key highlights. Most of the UI is neutral.
- Text contrast at least 4.5:1 (3:1 for large text). Muted text is still readable, never #ccc on white.
- Prefer near-black / near-white (e.g. #0a0a0a, #fafafa) over pure #000 / #fff.

## Surfaces and detail

- Pick one corner radius scale (e.g. 6px controls, 12px cards) and use it consistently.
- Borders and shadows: subtle. A 1px low-contrast border often beats a heavy shadow.
- Icons from one set, one stroke width, sized to the text next to them.
- Real images should be cropped intentionally (`object-fit: cover`, consistent aspect ratios).

## Avoid the generic-AI look

- No rainbow gradients on everything, no glowing purple blobs by default, no emoji as icons,
  no five drop shadows stacked, no centered-everything pages, no identical three-card rows for
  every section. Choose a direction that suits the product and commit to it.
- Every element earns its place. If removing it changes nothing, remove it.
