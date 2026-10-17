description: Solid React code: component structure, state, effects, lists, forms, data fetching, and the bugs to avoid.

# React patterns

## Components

- Small, focused components with clear props. Split when a component does two jobs, not by line count.
- One component per file for anything reused; keep tiny private helpers in the same file.
- Name components by what they are (`PricingCard`), handlers by what they do (`handleSubmit`, `onSelect`).
- Lift state only as far up as the closest common parent that needs it. Do not put everything in App.

## State

- Store the minimum; derive the rest during render (filtered lists, totals, "is valid").
  Never mirror props into state or keep two states that must stay in sync.
- Update based on the previous value with the function form: `setCount((c) => c + 1)`.
- Never mutate state: copy arrays/objects (`[...items, item]`, `{ ...user, name }`).
- Group related state in one object or a `useReducer` when updates touch several fields at once.

## Effects

- `useEffect` is for syncing with something outside React (fetching, subscriptions, timers,
  the DOM). Not for deriving data or reacting to your own state changes.
- Every effect that subscribes or starts something returns a cleanup (clear timers, abort
  fetches, remove listeners).
- Include every value the effect uses in its dependency array; fix loops by restructuring, never
  by lying about dependencies.

## Data fetching

- Track three states explicitly: loading, error, data. Render each one (skeleton or spinner,
  a clear error with a retry, the content, and an empty state).
- Abort or ignore stale requests: `AbortController` in the effect cleanup, or an `active` flag.
- Keep API calls in one small module (`src/api.js`) with the base URL from env, not scattered `fetch`es.
- Never put secrets in frontend code; anything in the bundle is public.

## Lists and keys

- `key` must be a stable id from the data, never the array index for lists that change order or size.

## Forms

- Controlled inputs for forms you validate; `onSubmit` on the `<form>` (not `onClick` on the button),
  `event.preventDefault()`, disable the submit button while sending, show success / error after.
- Validate on submit (and on blur for long forms); show messages next to fields.

## Performance (only when needed)

- Do not reach for `useMemo` / `useCallback` / `memo` by default. Use them for expensive
  calculations or to keep props stable for memoized children.
- Lazy-load heavy, rarely used parts (`React.lazy` + `Suspense`, `next/dynamic`).
- Images: explicit width/height (or aspect-ratio) to avoid layout shift, `loading="lazy"` below the fold.
