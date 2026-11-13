# CLAUDE.md — ssz-platform-admin

Platform admin panel for `ssz-platform` (plan 90 lives in the `ssz-platform-web` repo: `docs/plan/90-platform-admin-panel.md`;
decisions in `docs/admin-panel/decisions.md`).
Backend: monorepo `ssz-platform`, reached through the nginx gateway (`/api/v1/...`, `platform_admin` only).

## Stack

- Angular 22 (standalone components, signals, `inject()`, zoneless, no SSR), TypeScript strict
- PrimeNG 22 + `@primeuix/themes` + `primeicons`; **Tailwind CSS 4** for styling (plain CSS, not SCSS)
- Transloco for i18n (`uk` / `en` / `nb`), `chart.js` via `p-chart`
- `ng-openapi-gen` for API clients, Playwright for e2e, Vitest for unit tests, angular-eslint for lint
- Keep PrimeNG on the same major as Angular. The global Angular CLI decides the version `ng new` scaffolds; Node must satisfy the CLI's minimum (≥ 24.15)

## Status (plan 90, phase 5 — school lifecycle, branch `feature/admin-lifecycle`)

Built: runtime config, theme and language, sign-in with MFA, session and refresh, layout with guards, generated
API clients (organization, subscription, ai, analytics, content, user-profile), Ctrl+K palette, schools list, the school
card with six tabs (Overview, Members, Plan, AI & services, Journal, Danger zone), the reason dialog, the dashboard (KPIs,
attention queue, seats KPI). Phase 4 added student seats («Места» column, `seats=near|over`, `GrantDialog` for
`seats.students`). Phase 5 adds the lifecycle: the stored status `active / suspended / closed / purged` in the list filter,
the card header (`closesAt` / `purgeAt` with days left), the dashboard's "Needs attention" queue (a suspended school
closing in N days; a closed school purged within 7 days in red; each row links to the Danger zone) and the **Danger zone** tab — current status and date scale, moves by level, school name typed
to close at once or purge early. Sections other than Dashboard and Schools are a lazy "coming soon" page. Not run against a
live panel token yet (no `platform_admin` on dev; gateway answers were stubbed) — see the live checks in plan 90 §8.

## Layout of `src/app`

- `core/config` — runtime `/config.json` (`apiBaseUrl`, `primeUiLicense`), read before Angular starts. No `environment.ts`
- `core/auth` — `AdminSessionApi` (hand-written, 7 routes of `api/v1/auth/admin/session/*`), `SessionStore` (signals,
  access token in memory only), `authInterceptor`, `authGuard`, `levelGuard`, `*appIfLevel`, `admin-level.ts`
- `core/api` — `provideApiClients()` sets `apiBaseUrl` on every generated client
- `core/i18n`, `core/theme`, `core/storage.ts` — language / theme choice kept in `localStorage`
- `api/<service>` — **generated**, committed, outside lint and prettier; never edit by hand
- `layout` — shell, nav (one list in `nav-sections.ts` drives menu and routes), command palette
- `features/<name>` — login, dashboard, schools (list + card in `schools/card`), coming-soon, not-found
- `shared/reason-dialog` — the one dialog every admin change goes through (reason required, ≤ 500)

## Rules that are easy to break

- **Auth.** Access token lives in memory; refresh token is the httpOnly cookie `ssz_admin_rt`, so every auth call needs
  `withCredentials: true`. The interceptor adds Bearer only to `apiBaseUrl`, shares one refresh among parallel 401s
  and takes a Web Lock so tabs do not race on the rotating cookie. A token without `admin_level` ends the session.
- **Levels.** `support < admin < super`; `admin-level.ts` is a copy of the server rule (`packages/contracts`), the server
  is the source of truth. Hide what a level cannot do with `*appIfLevel` — never rely on it for security. Every level
  may _see_ every section; levels limit actions.
- **URL is the state of a list.** Schools filters, sort, page and size live in query params (`q`, `kind`, `status`,
  `sort`, `page`, `size`); defaults are not written, bad values fall back silently.
- **Lists are batch-read.** One request per page for owners (`GET profiles?userIds=`) and one for plans
  (`accounts/lookup`); never a request per row. A failed side request shows "—" and "retry", the table stays.
- **Generated clients.** `npm run api:gen` reads specs from the dev stand's service ports (organization :3002,
  subscription :3011, ai :3010, analytics :3008, content :3003, user-profile :3001), trims them to the operations the panel uses (`keep()` in `scripts/api-gen.mjs`),
  and refuses to overwrite a client when nothing matched (stale image). Add a new operation to `keep()`, then regenerate.
  Auth is hand-written because its login answers are anonymous objects Swagger does not type.
- **Every change has a reason.** Open `app-reason-dialog` from a button under `*appIfLevel` and pass the change as
  `[action]="(reason) => Observable"`; the action's own fields are projected and gated by `[ready]`. The server's
  refusal stays inside the dialog (409 = "changed meanwhile"); `done` fires only after success. Never name a template
  ref inside `p-dialog` `#content` / `#header` / `#footer` — PrimeNG takes it for its own template.
- **School card tabs** are child routes of `/schools/:id` (`card/school-tabs.ts`); the overview has no path and an
  unknown tab redirects to it. `SchoolCardData` is provided by the card page, so the tabs share one read of the school.
  A built tab goes into `TAB_COMPONENTS` in `schools.routes.ts`; the rest stay placeholders. Course titles on the overview
  come from content one `GET containers/:id` per course (no batch read there; capped at `MAX_COURSE_READS`), a 404/403
  marks that course "not found" and any other failure keeps the ids with a retry.
  The members tab keeps its filters in the URL (`role`, `status`, `group`, `page`, `size`; `members-query.ts`); the
  overview's people counts link there. Roster names come with the row; only unsynced rows (`name: null`) are asked
  of profiles, one request per page. The owner is not a roster row and has its own line (unfiltered first page).
  The plan tab (`card/plan`) takes the plan that applies from the card's lookup (it settles "no account / expired →
  free plan"); the account and its history answer 404 for a school subscription has never seen — read as "no account",
  not as an error. After any change it reloads the account, the history and the card's lookup. Days in its dialogs
  are sent as that day's 00:00 UTC (`plan-dates.ts`). `GrantDialog` takes a preset key and effect for the AI tab.
  `feature-keys.ts` copies subscription's key catalog — a new key there is one line here.
  The AI tab (`card/ai`) joins ai-service's keys and spend (what the gate reads) with subscription's live grants (why):
  `ai-key-rows.ts` names the source (plan / grant on / grant off / not in plan). Switching a key off or on opens
  `GrantDialog` with the key preset; a key off by a grant comes back by revoking that grant (a new switch-on would
  change nothing — the switch-off applies last). Without the grants the source is "—" and only "switch off" is offered.
  The payer policy is read on its own (it stays when the tariff is down); the school's settings are read only.
  The journal tab (`card/journal`) reads analytics `admin/audit?targetType=workspace&targetId=` (newest first, 50 per
  page), "more" appends the next page by the server cursor and a failed "more" keeps what is on screen; before/after
  unfold per entry. Every tab is built, so `TAB_COMPONENTS` has no placeholder left.
- **Dashboard** (`features/dashboard`, `/`): two independent reads that fail alone. KPIs from organization `admin/stats`
  follow the period switch (`?period=7|30|90|365`, default 30, a bad value falls back; one switch per page); the
  attention queue from subscription `admin/subscriptions/stats?withinDays=7` does not follow it. Each queue row links to
  the school's Plan tab (a `user` payer has no link — no user card until phase 6). No auto-refresh; "refresh" reads both.
- **Seats are one rule, copied.** `features/schools/seats.ts` mirrors organization's `seat-policy.vo.ts`: `none` (no
  limit) / `ok` / `near` (≥ 90 %, not over) / `warning` (in the +10 % margin) / `full` (at the ceiling). The list reads
  `seats { used, limit }`; a school without a projected limit shows `87` alone, never a made-up limit. Seats come only
  from organization (the projection), never from subscription directly. `seats=near` and `seats=over` do not overlap.
- **Lifecycle moves are one table, copied.** `features/schools/school-lifecycle.ts` mirrors organization's status rule
  (stored status, days to `closesAt` / `purgeAt`, `PURGE_URGENT_DAYS`). `card/danger/lifecycle-transitions.ts` decides what
  a level may press: suspend / reactivate — `admin`; close at once, restore, early purge — `super`. The tab hides what the
  level cannot do; the server still answers 403 (level) or 409 (wrong move, `SCHOOL_TRANSITION_NOT_ALLOWED`), shown in the
  dialog. Close and early purge ask for the school's name typed in full. The Journal tab knows the `school.*` actions.
- **All texts in three languages** (`public/i18n/{uk,en,nb}.json`); dynamic keys only via explicit branches.
- **PrimeNG is licensed.** No key in `config.json` → "Invalid PrimeUI License" banner. `public/config.json` is git-ignored
  (public repo); the template is `public/config.example.json`.
- **zoneless tests.** `whenStable()` also waits for unanswered HTTP requests of a resource; use `settle()` + `TestBed.tick()`.
- **p-dialog traps.** Projected content is created at once but reaches the DOM a few frames later and `onShow` fires after
  the animation — focus is set frame by frame until the field takes it.

## Commands

```bash
npm start                  # http://localhost:4200 (needs public/config.json and the dev stack on http://localhost)
npm run build
npm test -- --no-watch     # Vitest
npm run lint
npm run api:gen            # regenerate API clients from the running dev stack
```

Use Node ≥ 24.15 (nvm `v24.22.2` worked; 24.12 is too old for the CLI).

## Conventions

- Code comments in English only
- Git Flow with PRs: branch from `dev`, default branch is `dev`; no PR unless asked
- User installs dependencies manually: list packages and their purpose, never run `npm install` / `ng add` automatically
- Format only the files you touch (`npx prettier --write <file>`)
- One small, testable step at a time; stop and wait for confirmation after each step
