# ssz-platform-admin

Platform admin panel for `ssz-platform` (plan 90 — `ssz-platform-web/docs/plan/90-platform-admin-panel.md`).
For `platform_admin` accounts only, with a level `super` / `admin` / `support`; MFA is mandatory.

Today (phase 2): sign-in with MFA, layout with level-aware menu, Ctrl+K palette (sections and schools), read-only
list of schools. The other sections are placeholders.

## Requirements

- Node.js **≥ 24.15** (the Angular 22 CLI refuses older 24.x)
- the `ssz-platform` dev stack running (gateway on `http://localhost`)

## Configuration

Settings are read **at runtime** from `/config.json`, not baked into the build, so one build serves every
environment (a deployment only drops its own `config.json` next to `index.html`).

```bash
cp public/config.example.json public/config.json   # once; public/config.json is git-ignored
```

| Key              | Meaning                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apiBaseUrl`     | gateway origin, no trailing slash (`http://localhost` in dev)                                                                      |
| `primeUiLicense` | PrimeUI license key (PrimeNG 22 is licensed; Community license is free). Empty → PrimeNG shows an "Invalid PrimeUI License" notice |

## Commands

```bash
npm start              # ng serve on http://localhost:4200
npm run build          # production build into dist/
npm test -- --no-watch # unit tests (Vitest)
npm run lint
npm run api:gen        # regenerate API clients (see below)
```

Format only the files you touch: `npx prettier --write <file>`.

## Signing in on the dev stand

The panel accepts only a `platform_admin` with an admin level. There is none on a fresh stand — make the first
`super` from the auth container (for an existing account; the command grants the role and the level):

```bash
docker exec infrastructure-auth-service-1 dotnet AuthService.API.dll admin bootstrap <email>
```

Then open `http://localhost:4200/login`: password → MFA code. An account without MFA is led through setup (QR code,
first code, backup codes shown once). The dev CORS allows
the origin `http://localhost:4200` with credentials; the refresh cookie `ssz_admin_rt` is httpOnly and is sent only
to `/api/v1/auth/admin/session`.

Other levels are granted by a `super` (`PUT api/v1/auth/admin/admins/:userId`, a reason is required).

## API clients (`npm run api:gen`)

Typed clients in `src/app/api/<service>` are generated from the OpenAPI specs of the running dev stack
(organization `:3002`, subscription `:3011`, user-profile `:3001`) and **committed**, so CI and other machines
build without services. Each spec is trimmed to the operations the panel uses (`keep()` in `scripts/api-gen.mjs`).

```bash
npm run api:gen                    # all services
npm run api:gen -- organization    # only the named ones
API_GEN_HOST=http://10.0.0.5 npm run api:gen
```

If no operation matches (an old service image without the admin routes), the script fails and leaves the client as it was.
Auth is hand-written (`core/auth/admin-session.api.ts`): login answers are anonymous objects that Swagger does not type.

## URL state

The schools list keeps search, type, status, sort, page and size in the query string
(`/schools?q=nor&kind=SCHOOL&status=active&sort=-createdAt&page=2&size=50`); a link reproduces the screen.
Ctrl+K (⌘K on Mac) opens the palette from anywhere.
