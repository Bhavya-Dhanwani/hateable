# One-click deployments

Click **Deploy** in the workspace and the project is served at
`https://<project-name>.hateable.bhavyadhanwani.dev` (locally: `http://<name>.hateable.localhost:8088`).
If nobody visits for 15 minutes the site goes to sleep. The next visitor gets a Hateable loader
while it boots back up, then lands on the site without clicking anything. Each deployment has its
own analytics dashboard.

This guide covers how it works, file by file, in the order a request goes through the code.

---

## 1. The big picture

```
                     ┌────────────────────────── project-service (one Express app) ─────────────────────────┐
browser ──► ingress ─┤ proxy.middleware.ts                                                                   │
 shululu.hateable…   │   host ends with .DEPLOY_DOMAIN? ── no ──► previews / workspaces / /api (as before)  │
                     │        │ yes                                                                         │
                     │        ▼                                                                             │
                     │   touchDeployment(slug)  ── Redis SET deploy:active:<slug> PX 15min XX               │
                     │        │ awake                         │ asleep                                      │
                     │        ▼                               ▼                                             │
                     │   proxy to deploy-service-<slug>   Deployment in Mongo? ─ no ─► themed 404           │
                     │        │ on response               claimDeploymentWake (SET … NX)                    │
                     │        ▼                              winner ─► startDeployment() in background      │
                     │   recordHit() → Redis counters     everyone ─► 503 "waking up" loader                │
                     └──────────────────────────────────────────────────────────────────────────────────────┘
                                                   ▲
   Redis key expires after 15 quiet minutes ──► keyspace event ──► sleepDeployment(): delete pod + service
```

Everything above runs in projectService, which already proxied previews and reaped idle preview
pods. Deployments reuse both mechanisms, so there's no new service to run.

---

## 2. Click "Deploy": the snapshot

`POST /api/projects/:projectId/deployment` → [deployments.controller.ts](src/modules/deployments/deployments.controller.ts) `deploy`

1. **Ownership check.** Same rule as the pods controller: `project.userId` must match the JWT user.
2. **Pick the subdomain** ([slugify.util.ts](src/shared/utils/slugify.util.ts)). `"Shululu App!"` becomes `shululu-app`.
   The slug has to be a single DNS label (`SLUG_PATTERN`). If another project already owns it,
   we append the last 5 characters of the project id. A redeploy keeps the slug it already has.
3. **Freeze the files** ([s3.service.ts](src/shared/services/s3.service.ts) `snapshotPrefix`). While you edit,
   the sync container in the workspace pod keeps mirroring files to S3 under `<projectId>/`.
   Deploying copies that prefix server side (`CopyObject`) to `deployments/<slug>/`. Later edits
   don't touch the live site until you click **Redeploy**. The old snapshot is cleared first, so
   files you deleted also disappear from the site.
4. **Save the record** ([deployment.dao.ts](src/shared/dao/deployment.dao.ts)). One `Deployment` per project, upserted,
   with `version` incremented by `$inc` on every deploy.
5. **Start the pod** ([deployment.service.ts](src/shared/services/deployment.service.ts) `startDeployment`).

### What a deployment pod looks like ([k8s.service.ts](src/shared/services/k8s.service.ts) `createDeploymentPod`)

`createPod` (previews) and `createDeploymentPod` now share `buildAppContainers(projectType)`,
which holds the per-stack image, port and command logic. The deployment pod differs from a
preview pod in two ways:

|            | preview pod                           | deployment pod                    |
| ---------- | ------------------------------------- | --------------------------------- |
| init       | copy boilerplate into the volume      | same, **then** `restore-snapshot` |
| containers | app + express file server + live sync | **app only**                      |

`restore-snapshot` runs the existing `sync-image` with `PROJECT_ID=deployments/<slug>` and
`SYNC_ONCE=true`. The sync service downloads the snapshot over the boilerplate and then exits
instead of starting its watcher (see [syncService/src/index.ts](../syncService/src/index.ts)). Kubernetes only starts
the app container after every init container has finished, so the app boots with the deployed
files already in place.

The pod is `deploy-pod-<slug>` and its Service is `deploy-service-<slug>`. The proxy only ever
talks to the Service DNS name, which stays the same across sleeps and redeploys.

---

## 3. The 15-minute timer: one Redis key

[activity.service.ts](src/shared/services/activity.service.ts) covers the whole lifecycle with one key per site:
`deploy:active:<slug>`, with a TTL of `DEPLOY_IDLE_TTL_MS` (900000 ms).

| function                     | Redis command              | meaning                                                                                                                                   |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `touchDeployment`            | `SET key now PX 900000 XX` | **XX** only writes if the key exists. A reply of `OK` means the site is awake and the timer restarts at 15 min. `null` means it's asleep. |
| `claimDeploymentWake`        | `SET key now PX 900000 NX` | **NX** only writes if the key is missing. When 50 people hit a sleeping site at once, exactly one gets `OK` and starts the pod.           |
| `getDeploymentIdleRemaining` | `PTTL key`                 | the "naps in 12:34" countdown in the UI                                                                                                   |
| `sleepDeployment`            | runs on key **expiry**     | deletes the pod and service                                                                                                               |

**How the site falls asleep.** Redis can publish an event whenever a key expires (keyspace
notifications, `notify-keyspace-events Ex`). `startIdleReaper` already turns that on and
subscribes to `__keyevent@0__:expired` for previews. Deployments add a branch for the
`deploy:active:` prefix. Each visit pushes the expiry back, so the event only fires after 15
minutes with no visits at all. No cron job or polling loop is involved.

**Race guards:**

- `deploy:reaping:<slug>` (`SET NX EX 60`) makes sure only one project-service replica handles the expiry.
- `sleepDeployment` re-checks `EXISTS deploy:active:<slug>` first. If a visitor woke the site in
  the moment between expiry and the event arriving, it's left running.
- `startDeployment` deletes the old pod and waits until it's really gone before recreating it
  (`deletePod` polls). Otherwise Kubernetes returns 409 "object is being deleted".
- If a wake fails, `startDeployment` deletes the key so the next visitor tries again.

Only the pod is deleted on sleep. The Mongo record and the S3 snapshot stay, which is why waking
the site just means calling `startDeployment` again.

---

## 4. The visitor's request ([proxy.middleware.ts](src/shared/middlewares/proxy.middleware.ts))

`handleProxy` runs before body parsers and helmet, as before. The deployment check comes **first**
because a slug like `my-preview` contains the word "preview", which the older host checks match on.

```
hostname = "shululu.hateable.localhost"  →  slug = "shululu"
```

1. Validate the slug against `SLUG_PATTERN`. The Host header is attacker controlled, and the slug
   ends up in Redis keys and HTML.
2. `touchDeployment`: if the site is awake, hand the request to the cached `http-proxy-middleware`
   for `http://deploy-service-<slug>`.
3. If it's asleep, look up the Deployment. No record means the themed 404. Otherwise `claimDeploymentWake`;
   the winner calls `startDeployment(...)` without awaiting it. Everyone gets the loader with a 503.

### The loader ([deploy.templates.ts](src/shared/templates/deploy.templates.ts))

The loader is plain HTML with no assets: the site's address, one line of text and a 1px progress
sweep. It follows the visitor's light/dark preference. Visitors came for the user's site, not for
Hateable, so the page stays out of the way. It's served in two cases:

- the site is **asleep** (above), and
- the pod exists but the app isn't listening yet. The proxy's `error` handler (ECONNREFUSED)
  serves the same page.

Each loader response carries an `x-hateable-waking: 1` header. The page's script re-fetches its own
URL every 1.5 s. Once a response comes back **without** that header (the real site answered), it
fades the text out for 250 ms and calls `location.reload()`. Those polls also count as visits, so the timer can't run out
while someone is waiting. `<noscript>` falls back to a meta refresh.

---

## 5. Analytics ([analytics.service.ts](src/shared/services/analytics.service.ts))

### Collecting

The proxy's `proxyRes` hook fires once per response the **site** sends back. Loader pages don't
count, because the site didn't answer them. `recordHit` builds one Redis `MULTI`:

| what                                              | key `analytics:<slug>:…`          | Redis type                                                     |
| ------------------------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| requests, total response ms, page views, wake-ups | `totals`                          | hash, `HINCRBY`                                                |
| 2xx / 3xx / 4xx / 5xx                             | `status`                          | hash                                                           |
| views / requests per day                          | `views:YYYY-MM-DD`, `requests:…`  | counter, expires after 35 days                                 |
| unique visitors (all time and per day)            | `visitors`, `visitors:YYYY-MM-DD` | **HyperLogLog**                                                |
| live visitors                                     | `live`                            | sorted set, score = last seen                                  |
| top pages, referrers                              | `paths`, `referrers`              | sorted set, `ZINCRBY`, trimmed to 200                          |
| devices, browsers                                 | `devices`, `browsers`             | hash ([userAgent.util.ts](src/shared/utils/userAgent.util.ts)) |

Notes on these choices:

- **Page view vs. request.** A request is anything (js, css, images). A page view is a document
  navigation: `Sec-Fetch-Dest: document`, or `Accept: text/html` on older browsers.
- **Visitor identity.** `sha256(ip + user agent)` truncated to 16 hex characters. The raw IP is
  never stored. The IP comes from the first entry of `X-Forwarded-For`, which ingress-nginx sets.
- **HyperLogLog.** Counting uniques exactly means storing every visitor. HLL keeps a sketch of
  about 12 KB per key with roughly 1% error, whether you have 10 visitors or 10 million. `PFADD`
  adds a visitor and `PFCOUNT` reads the estimate.
- **Live now.** `ZADD live <now> <visitor>` on each page view. At read time, entries older than
  5 minutes are removed and `ZCARD` counts what's left.
- **Response time.** The proxy stores the request start time in a `WeakMap`. On `proxyRes` it adds
  `now - start` to `totals.responseMs`. Average = `responseMs / requests`.

### Reading

`GET /api/projects/:projectId/deployment/analytics?days=14` makes a single `MULTI` with about 50
commands and one round trip, and the controller returns the result. The frontend
[AnalyticsPage.jsx](../frontend/src/pages/AnalyticsPage.jsx) refetches every 10 s.

> Redis is not durable in this dev stack: there's no volume, so a restart loses the counters.
> In production, enable AOF on Redis or roll each finished day up into Mongo.

---

## 6. Frontend

- [DeployButton.jsx](../frontend/src/components/workspace/DeployButton.jsx), in the workspace header. Before the first
  deploy it's a gradient **Deploy** button. After that it shows **Live** or **Asleep** and opens a
  popover with the link (copy / open), the live "naps in mm:ss" countdown, **Redeploy**,
  **Analytics** and **Unpublish**. The countdown converts the server's `idleRemainingMs` into a
  wall-clock `sleepsAt` time and ticks locally.
- [AnalyticsPage.jsx](../frontend/src/pages/AnalyticsPage.jsx) at `/projects/:id/analytics` has stat tiles, a
  page-views-per-day bar chart with hover tooltip and a table view, and ranked lists for pages,
  referrers, devices and browsers.
- [ingressUrl.js](../frontend/src/utils/ingressUrl.js): in dev the ingress listens on :8088, so links get that port.
  Set `VITE_PREVIEW_PORT=` (empty) in prod.

---

## 7. API

| method | path                                                | does                                                                                      |
| ------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/api/projects/:id/deployment`                      | `{ deployment, url, status: live\|sleeping, idleRemainingMs }`, or `{ deployment: null }` |
| POST   | `/api/projects/:id/deployment`                      | deploy or redeploy (201 first time, 200 after)                                            |
| DELETE | `/api/projects/:id/deployment`                      | unpublish: pod, snapshot and analytics deleted, slug freed                                |
| GET    | `/api/projects/:id/deployment/analytics?days=1..30` | dashboard data                                                                            |

---

## 8. Running it

**Locally.** `skaffold dev` as usual. Chrome and Firefox resolve `*.localhost` to 127.0.0.1, so
`http://shululu.hateable.localhost:8088` works without any hosts-file changes.

**Production on `hateable.bhavyadhanwani.dev`:**

1. DNS: a wildcard record `*.hateable.bhavyadhanwani.dev` pointing at the ingress load balancer.
2. TLS: a wildcard certificate. Let's Encrypt only issues wildcards through the **DNS-01**
   challenge, e.g. cert-manager with your DNS provider's solver.
3. [k8s/ingress.yml](../k8s/ingress.yml): change the host to `*.hateable.bhavyadhanwani.dev` and add the `tls:` block.
4. [k8s/project-deployment.yml](../k8s/project-deployment.yml): set `DEPLOY_DOMAIN=hateable.bhavyadhanwani.dev`,
   `DEPLOY_PROTOCOL=https`, and `APP_URL` to your frontend URL.

**Security note.** User sites run arbitrary code on subdomains of your app's domain. The refresh
cookie is host-only, so it isn't sent to them. But a user site _can_ set cookies for
`.hateable.bhavyadhanwani.dev` that your app at `hateable.bhavyadhanwani.dev` will then receive,
and SameSite treats the two as the same site. That's why Vercel uses `vercel.app` and Netlify uses
`netlify.app`. Once this goes public, serve user sites from a separate registrable domain (or get
yours onto the Public Suffix List).

---

## 9. Known limits, and when to fix them

- Deployment pods run the stack's **dev server** (`npm run dev`), the same image as previews. That
  keeps one image per stack. A production build (`npm run build && npm start`, or serving `dist/`
  from nginx) would cut cold starts and memory use. Add a `build` init step per stack in
  `buildAppContainers` when that matters.
- Snapshot copies run one at a time. That's fine for source trees, since `node_modules` is never
  synced. Batch them if deploys get slow.
- Client-side route changes in a SPA don't produce a page view, because only real document loads
  pass through the proxy.

Tests: `pnpm --filter projectservice test` (slug and user-agent rules).
