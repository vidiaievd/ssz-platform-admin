# CLAUDE.md — ssz-platform-admin

Platform admin panel for `ssz-platform` (plan 90 lives in the `ssz-platform-web` repo: `docs/plan/90-platform-admin-panel.md`).
Backend: monorepo `ssz-platform`, reached through the nginx gateway (`/api/v1/...`, `platform_admin` only).

## Stack

- Angular 22 (standalone components, signals, `inject()`, no SSR), TypeScript strict
- PrimeNG 22 + `@primeuix/themes` + `primeicons`; **Tailwind CSS 4** for styling (plain CSS, not SCSS)
- Transloco for i18n (`uk` / `en` / `nb`), `chart.js` via `p-chart`
- `ng-openapi-gen` for API clients, Playwright for e2e, Vitest for unit tests, angular-eslint for lint
- Keep PrimeNG on the same major as Angular. The global Angular CLI decides the version `ng new` scaffolds; Node must satisfy the CLI's minimum

## Conventions

- Code comments in English only
- Git Flow with PRs: branch from `dev`, default branch is `dev`; no PR unless asked
- User installs dependencies manually: list packages and their purpose, never run `npm install` / `ng add` automatically
- Format only the files you touch (`npx prettier --write <file>`)
- One small, testable step at a time; stop and wait for confirmation after each step
