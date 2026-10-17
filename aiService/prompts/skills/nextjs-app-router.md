description: Next.js App Router projects: server vs client components, routing and layouts, metadata, data fetching, images and fonts.

# Next.js (App Router)

Applies when the project has an `app/` (or `src/app/`) directory with `page.js`/`page.tsx` files.

## Server and client components

- Components are Server Components by default: they can be `async`, fetch data directly and ship
  no JavaScript. Keep pages and layouts as server components whenever possible.
- Add `'use client'` (first line of the file) only to components that need state, effects, event
  handlers or browser APIs. Push it down to the smallest interactive leaf (a button, a form),
  not the whole page.
- Never import a server-only module (database, secrets) into a client component. Only
  `NEXT_PUBLIC_*` env vars reach the browser.
- Props passed from server to client components must be serializable (no functions, no class instances).

## Routing and layouts

- A route is a folder with `page.js`: `app/pricing/page.js` -> `/pricing`; dynamic:
  `app/blog/[slug]/page.js` (in Next 15+, `params` is a Promise: `const { slug } = await params`).
- Shared UI goes in `layout.js` (the root `app/layout.js` holds `<html lang>` and `<body>`).
- Add `loading.js` for streaming loading UI, `error.js` (a client component) for errors,
  and `not-found.js` for 404s.
- Navigate with `<Link href>` from `next/link`; programmatic navigation with `useRouter` from
  `next/navigation` (client components only).

## Data

- Fetch in server components (`await fetch(...)`, or call your data layer directly).
  Choose caching deliberately: `{ cache: 'no-store' }` for always-fresh data,
  `{ next: { revalidate: 60 } }` for periodically refreshed data.
- Mutations: Server Actions (`'use server'` functions passed to `<form action>`) or Route Handlers
  in `app/api/.../route.js` exporting `GET` / `POST`. Validate input on the server.

## Metadata, images, fonts

- Export `metadata` (or `generateMetadata`) from layouts and pages for title and description.
- Use `next/image` with `width`/`height` (or `fill` + a sized parent) and `alt`; remote images
  need their domain in `next.config` `images.remotePatterns` (images.unsplash.com for stock photos).
- Load fonts with `next/font/google` or `next/font/local` and apply the generated className.

## Common mistakes

- `useState`/`useEffect`/`onClick` in a file without `'use client'` (build error).
- Putting `'use client'` on the root layout or every page (loses server rendering).
- Using `window`/`localStorage` during render in client components (guard in `useEffect`).
