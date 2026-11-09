#!/usr/bin/env node
// Regenerates the typed API clients in src/app/api/<service> from the OpenAPI specs of a running
// dev stand. The generated code is committed, so CI and other machines build without services.
//
//   npm run api:gen                    # every service below
//   npm run api:gen -- organization    # only the named ones
//   API_GEN_HOST=http://10.0.0.5 npm run api:gen
//
// Each spec is trimmed to the operations the panel uses before generation (ng-openapi-gen can
// filter by tag only, and tags are too coarse: `profiles` has seven routes, the panel needs one).
// `servers` is dropped, so a client never carries a service port: the gateway address comes from
// the runtime config.json (see core/api/provide-api-clients.ts).

import { createRequire } from 'node:module';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { NgOpenApiGen } = require('ng-openapi-gen/lib/ng-openapi-gen');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Host of the dev stand, without a port: each service is read from its own port below.
const HOST = (process.env.API_GEN_HOST ?? 'http://localhost').replace(/\/+$/, '');

/**
 * `keep(method, path)` picks operations; paths in the specs already carry `/api/v1`.
 * `prefix` names the per-client classes (`<prefix>Api`, `<prefix>ApiConfiguration`) so the
 * clients do not collide when one file imports two of them.
 */
const SERVICES = [
  {
    name: 'organization',
    port: 3002,
    prefix: 'Organization',
    keep: (_method, p) => p.startsWith('/api/v1/admin/'),
  },
  {
    name: 'subscription',
    port: 3011,
    prefix: 'Subscription',
    keep: (_method, p) => p.startsWith('/api/v1/admin/subscriptions/'),
  },
  {
    name: 'ai',
    port: 3010,
    prefix: 'Ai',
    // A payer's AI keys and spend, and its policy (school card, "AI & services").
    keep: (_method, p) =>
      p.startsWith('/api/v1/admin/ai/usage/') || p.startsWith('/api/v1/admin/ai/payer-policies/'),
  },
  {
    name: 'analytics',
    port: 3008,
    prefix: 'Analytics',
    // The admin journal collected from every service (school card, "Journal").
    keep: (method, p) => method === 'get' && p === '/api/v1/admin/audit',
  },
  {
    name: 'user-profile',
    port: 3001,
    prefix: 'UserProfile',
    // Owner names for the schools list (any role's JWT, up to 100 ids).
    keep: (method, p) => method === 'get' && p === '/api/v1/profiles',
  },
];

const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/**
 * Keeps the chosen operations and shortens Nest's operation ids:
 * `AdminSchoolsController_list` → `adminSchoolsList`, `AdminAccountsLookupController_lookup` →
 * `adminAccountsLookup` (a method that repeats the controller's last word is dropped).
 */
function trimSpec(spec, keep) {
  const paths = {};
  const seen = new Set();
  for (const [p, item] of Object.entries(spec.paths ?? {})) {
    const kept = {};
    for (const [key, value] of Object.entries(item)) {
      if (!METHODS.has(key)) {
        kept[key] = value; // path-level parameters, summary, …
        continue;
      }
      if (!keep(key, p)) continue;
      const operationId = shortOperationId(value.operationId);
      if (!operationId) throw new Error(`${key.toUpperCase()} ${p} has no operationId`);
      if (seen.has(operationId)) throw new Error(`duplicate operationId ${operationId}`);
      seen.add(operationId);
      kept[key] = { ...value, operationId };
    }
    if (Object.keys(kept).some((k) => METHODS.has(k))) paths[p] = kept;
  }
  const { servers: _servers, ...rest } = spec;
  return { spec: { ...rest, paths }, operations: seen.size };
}

function shortOperationId(id) {
  const match = /^(\w+)Controller_(\w+)$/.exec(id ?? '');
  if (!match) return id;
  const [, controller, method] = match;
  return controller.toLowerCase().endsWith(method.toLowerCase())
    ? controller
    : `${controller}_${method}`;
}

async function fetchSpec(service) {
  const url = `${HOST}:${service.port}/api/docs-json`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new Error(`${url} is unreachable (is the dev stand up?): ${error.cause?.code ?? error}`);
  }
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response.json();
}

async function generate(service) {
  const { spec, operations } = trimSpec(await fetchSpec(service), service.keep);
  if (operations === 0) {
    // An old image without the admin routes would otherwise wipe the committed client.
    throw new Error(`${service.name}: no operation matched — is the running image up to date?`);
  }
  const output = path.join(ROOT, 'src/app/api', service.name);
  new NgOpenApiGen(spec, {
    output,
    silent: true,
    removeStaleFiles: true,
    endOfLineStyle: 'lf',
    // Observables: requests can be cancelled (switchMap in the search palette).
    promises: false,
    configuration: `${service.prefix}ApiConfiguration`,
    apiService: `${service.prefix}Api`,
  }).generate();
  // The generator leaves its working folder behind when it is empty.
  await rm(`${output}$`, { recursive: true, force: true });
  console.log(`${service.name}: ${operations} operations → src/app/api/${service.name}`);
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !SERVICES.some((s) => s.name === name));
if (unknown.length > 0) {
  console.error(
    `Unknown service(s): ${unknown.join(', ')}. Known: ${SERVICES.map((s) => s.name).join(', ')}`,
  );
  process.exit(1);
}

let failed = false;
for (const service of SERVICES.filter((s) => wanted.length === 0 || wanted.includes(s.name))) {
  try {
    await generate(service);
  } catch (error) {
    failed = true;
    console.error(`${service.name}: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
