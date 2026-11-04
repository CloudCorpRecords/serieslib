# BUILD REPORT — serieslib

Rebuild of `com.elkassabgidata/elkassabgidata` (remote-only, keyless capture)
as `@reneturcios/serieslib` 0.1.0 / `io.github.CloudCorpRecords/serieslib`.

## Fixture conflicts

**None.** The brief, the spec prose, and the fixture agree on all 12 tool
names and every required field:

- `search_econ_series` [query]; `get_econ_series` [series_id];
  `get_econ_series_metadata` [series_id]; `list_econ_sources` [];
  `get_data_freshness` []; `get_econ_bundle_manifest` [];
  `get_hf_download_link` [ticker]; `get_hf_variables_dictionary` [];
  `list_ip_bundles` []; `get_ip_download_link` [file];
  `get_family_status` []; `get_auth_status` [].

The fixture's tool literals (name, title, description, inputSchema —
including enums, `minLength`, patterns, defaults, nested keys and the
`$schema` keys) are served verbatim from `src/forward.ts`. Captured
annotations are not reproduced, per the brief (parity compares
inputSchema).

## What was built

All 19 factory files under `builds/serieslib/`:

- `package.json` (`@reneturcios/serieslib` 0.1.0, bin
  `serieslib` → `dist/cli.js`, deps exactly `@modelcontextprotocol/sdk ^1`
  + `zod ^3`; devDeps `@types/node ^20`, `tsx ^4`, `typescript ^5`)
- `server.json` (description exactly the prescribed 91-char string; npm
  entry carries `"version": "0.1.0"`; OCI entry
  `ghcr.io/cloudcorprecords/serieslib:0.1.0` carries **no** version field)
- `Dockerfile` (node:20-alpine both stages; server-name label matches
  `server.json`)
- `tsconfig.json` (fleet-identical, 318 bytes), `.gitignore`,
  `package-lock.json`, `README.md` (fresh prose), `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `CHANGELOG.md` (single 0.1.0 entry,
  2026-10-27)
- `src/index.ts`, `src/cli.ts`, `src/mcp.ts`, `src/types.ts`,
  `src/forward.ts` (core; exports `VERSION = "0.1.0"`)
- `test/forward.test.ts`
- `.github/workflows/{ci.yml, publish.yml, publish-container.yml,
  registry-publish.yml}` (container workflow: IMAGE
  `ghcr.io/cloudcorprecords/serieslib`, smoke assertion on server name
  `serieslib`)

## Design

- Forwarding client to `https://elkassabgidata-mcp.elkassabgi.workers.dev/mcp`,
  overridable via `ELKASSABGI_MCP_URL` (labelled reconstruction).
  tools/call is forwarded as a streamable-HTTP JSON-RPC client:
  initialize (protocolVersion `2025-03-26`, clientInfo `serieslib`) →
  notifications/initialized → tools/call, honouring `Mcp-Session-Id` when
  issued; session established lazily and reused per client. Plain-JSON
  and SSE replies both parsed; upstream results pass through verbatim
  (including `isError` and extra fields such as `structuredContent`).
- Upstream failures (JSON-RPC error, non-2xx status, malformed body,
  throwing/timing-out fetch) surface as `serieslib error:` text results
  (labelled reconstruction).
- Registration via the MCP SDK **low-level** `Server` API
  (`ListToolsRequestSchema` / `CallToolRequestSchema` handlers) serving
  the fixture literals exactly; no `McpServer` + zod registration.
  `src/mcp.ts` also exports `createServer` / `startMcpServer` /
  `handleCallTool` so the MCP layer is testable without a transport;
  the CLI's `mcp` subcommand starts it over stdio.
- Core takes an injectable fetch (`ForwardDeps.fetchFn`), so all tests
  run against a stubbed JSON-RPC upstream. No live network calls in
  tests; no live call claimed anywhere.

## Lockfile (Route 3, clean from birth)

Generated in a temp dir containing only the new `package.json`:
`npm install --package-lock-only --ignore-scripts --offline`.
Verified: parses, `name == @reneturcios/serieslib`, **128 package
entries**. Then `npm install --offline --ignore-scripts` in the build
dir for `node_modules`. No write-guard failure occurred; no fallback
(symlink/staging) was needed.

## Verification (all in the build dir)

- `npx tsc --noEmit` → exit 0
- `npm run build` → real `dist/` (cli.js 2339 B, forward.js 19998 B,
  mcp.js 2683 B, all non-empty, with `.d.ts` + source maps)
- `node dist/cli.js --version` → `0.1.0`; unknown subcommand → usage on
  stderr, exit 2
- `npm test` → **31 tests, 31 pass, 0 fail** (7 suites: registration
  integrity — served tools deep-equal the fixture's full 12 tool
  objects, names in order, required fields per tool; session
  establishment/reuse/session-id handling; env + url overrides;
  verbatim argument forwarding; verbatim result pass-through incl.
  upstream isError and SSE; JSON-RPC/init/malformed/HTTP/throw/timeout
  failures → `serieslib error:`; parseRpcBody; MCP-layer validation;
  CLI --version / unknown exit 2 / bad-JSON exit 2)
- Parity: `python3 harness/parity.py --original
  harness/fixtures/elkassabgidata-tools-original.json --rebuild
  "stdio:node dist/cli.js mcp" --out parity-out` → **PASS, parity 100.0,
  12/12 identical, no missing/extra/schema diffs** (see
  `parity-out/parity.json`)
- Consistency sweep: package.json version = server.json top-level =
  npm-entry version = OCI tag = core `VERSION` = CHANGELOG heading
  (0.1.0); package.json `mcpName` = server.json `name` = Dockerfile
  label; server.json description measured at 91 chars; OCI entry
  confirmed to have no `version` field.

Clean-room: all prose and code written fresh; only the fixture's tool
literals are served verbatim.
