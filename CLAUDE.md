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

## Status (plan 90, phase 2 — shell, branch `feature/admin-shell`)

Built: runtime config, theme and language, sign-in with MFA, session and refresh, layout with guards, generated
API clients, read-only schools list, Ctrl+K palette. Sections other than Schools are a lazy "coming soon" page.
School card is a stub until phase 3.

## Layout of `src/app`

- `core/config` — runtime `/config.json` (`apiBaseUrl`, `primeUiLicense`), read before Angular starts. No `environment.ts`
- `core/auth` — `AdminSessionApi` (hand-written, 7 routes of `api/v1/auth/admin/session/*`), `SessionStore` (signals,
  access token in memory only), `authInterceptor`, `authGuard`, `levelGuard`, `*appIfLevel`, `admin-level.ts`
- `core/api` — `provideApiClients()` sets `apiBaseUrl` on every generated client
- `core/i18n`, `core/theme`, `core/storage.ts` — language / theme choice kept in `localStorage`
- `api/<service>` — **generated**, committed, outside lint and prettier; never edit by hand
- `layout` — shell, nav (one list in `nav-sections.ts` drives menu and routes), command palette
- `features/<name>` — login, schools, coming-soon, not-found

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
  subscription :3011, user-profile :3001), trims them to the operations the panel uses (`keep()` in `scripts/api-gen.mjs`),
  and refuses to overwrite a client when nothing matched (stale image). Add a new operation to `keep()`, then regenerate.
  Auth is hand-written because its login answers are anonymous objects Swagger does not type.
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
