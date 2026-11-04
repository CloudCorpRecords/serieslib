# serieslib

serieslib is a thin local bridge to the ElKassabgi data
family's hosted MCP server, which publishes three
libraries under one endpoint: an economics catalog with
billions of time series drawn from hundreds of official
sources, a high-frequency library of 1-minute US equity
bars and pre-computed academic variables, and an
intellectual-property library of patent-level innovation
measures.

The bridge holds no data and computes nothing. It
serves the upstream server's tool list locally —
exactly as captured from the live endpoint — and
forwards each tool call upstream, returning the result
untouched. Search, metadata, source lists, freshness
and status tools are free at the upstream; a few
downloads there ask for the family's own free API key,
which stays an upstream concern: this client sends no
credential of its own, and `get_auth_status` reports
the upstream connection's key state.

## Tools

- `search_econ_series` — search the economics catalog
  by free text (`query`, required). Optional: `source`
  to restrict to one source id, `limit` (1-50, default
  15) and `offset` for paging, and `lang` (`en`, `ar`,
  `es`, `fr`, `ru`, `zh`) for source-official translated
  titles where they exist. Returns series ids for the
  other tools.
- `get_econ_series` — download one series as date/value
  rows with its citation and licence. Required:
  `series_id`. Optional: `date_from` / `date_to`
  (`YYYY-MM-DD`) to window long series, and `max_rows`
  (10-2000, default 400).
- `get_econ_series_metadata` — full metadata for one
  series (`series_id`, required): title, frequency,
  geography, unit, licence including the commercial-use
  flag, attribution, and coverage dates.
- `list_econ_sources` — enumerate the catalog's sources
  (statistical offices, monetary authorities, IGOs,
  research datasets) with their licences. Optional:
  `contains`, a case-insensitive filter on source id or
  name.
- `get_data_freshness` — the per-source update board
  from the upstream updater's ledger: last successful
  update, data frontier, and stale or failure flags.
  Optional: `source` for a single source.
- `get_econ_bundle_manifest` — build a citable
  Frictionless-style bundle manifest: up to 50 explicit
  series ids (`ids`), or every series of one small
  source (`source`, up to 1,000). Unresolvable ids are
  reported, never dropped.
- `get_hf_download_link` — authenticated download
  instructions for the high-frequency library. Required:
  `ticker` (e.g. `AAPL`). Optional: `dataset` (`bars`,
  `variables` or `quality`, default `bars`), `version`
  (`clean` or `raw`, default `clean`), and `format`
  (`parquet` or `csv`, default `parquet`; csv applies
  to bars only). Files hold all of a ticker's bars and
  are fetched by your own code, not returned inline.
- `get_hf_variables_dictionary` — the exact published
  definitions and formulas of the 25 pre-computed
  academic variables. No arguments.
- `list_ip_bundles` — list the IP library's
  snapshot-pinned patent and innovation bundles, with
  sizes, vintages and download paths. No arguments.
- `get_ip_download_link` — authenticated download
  instructions for one IP bundle. Required: `file`
  (`patent_measures.parquet` or
  `assignee_year.parquet`). Optional: `vintage` to pin
  a snapshot instead of the newest.
- `get_family_status` — live headline stats and data
  currency for all three libraries. No arguments.
- `get_auth_status` — whether the upstream connection
  has a family API key configured (masked; the key is
  never echoed) and how to add one. No arguments.

## Configuration

- `ELKASSABGI_MCP_URL` (optional) — override the
  upstream endpoint. Defaults to
  `https://elkassabgidata-mcp.elkassabgi.workers.dev/mcp`.
  (The override hook is this rebuild's own labelled
  reconstruction.)

### Forwarding mechanics

On the first tool call the client opens a streamable
HTTP session with the upstream: a JSON-RPC `initialize`
request (protocolVersion `2025-03-26`, clientInfo name
`serieslib`), then a `notifications/initialized`
notification, then the `tools/call` request carrying
the caller's arguments unchanged. When the upstream
answers `initialize` with an `Mcp-Session-Id` header,
that value rides on every later request of the
session, which is reused for the life of the process.
Replies may arrive as plain JSON or as
server-sent events; both are read.

Successful upstream results pass through verbatim,
including any `isError` flag the upstream sets.
Failures — a JSON-RPC error, a non-2xx status, an
unreadable response, or a request that cannot be
completed — come back as an `isError` result whose
text starts with `serieslib error:` (this rendering is
this rebuild's own labelled reconstruction).

## CLI

Each tool is also a subcommand taking one JSON
argument string (omit it for tools that take none):

```bash
npx @reneturcios/serieslib search_econ_series '{"query":"germany inflation"}'
npx @reneturcios/serieslib get_econ_series_metadata '{"series_id":"worldbank:NY.GDP.MKTP.CD:DEU"}'
npx @reneturcios/serieslib list_econ_sources
npx @reneturcios/serieslib --version
```

Exit codes: `0` on success, `1` on an `isError`
result, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/serieslib mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "serieslib": {
      "command": "npx",
      "args": ["-y", "@reneturcios/serieslib", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/serieslib
docker run --rm ghcr.io/cloudcorprecords/serieslib --version
```

The container's default command is `mcp`, so the first
form is a stdio MCP server; any other arguments reach
the CLI normally.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

The test suite runs entirely against a stubbed
JSON-RPC upstream — no live network calls.

## License

MIT — see `LICENSE`.
