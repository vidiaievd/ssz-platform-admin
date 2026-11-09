# ssz-platform-admin

Platform admin panel for `ssz-platform` (plan 90 — `ssz-platform-web/docs/plan/90-platform-admin-panel.md`).

## Requirements

- Node.js **≥ 24.15** (the Angular 22 CLI refuses older 24.x)
- the `ssz-platform` dev stack running (gateway on `http://localhost`)

## Configuration

Settings are read **at runtime** from `/config.json`, not baked into the build, so one build serves every
environment (a deployment only drops its own `config.json` next to `index.html`).

```bash
cp public/config.example.json public/config.json   # once; public/config.json is git-ignored
```

| Key | Meaning |
|---|---|
| `apiBaseUrl` | gateway origin, no trailing slash (`http://localhost` in dev) |
| `primeUiLicense` | PrimeUI license key (PrimeNG 22 is licensed; Community license is free). Empty → PrimeNG shows an "Invalid PrimeUI License" notice |

## Commands

```bash
npm start              # ng serve on http://localhost:4200
npm run build          # production build into dist/
npm test -- --no-watch # unit tests (Vitest)
npm run lint
```

Format only the files you touch: `npx prettier --write <file>`.
