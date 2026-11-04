# Changelog

## 0.1.0 (2026-10-27)

- First release: a forwarding client for the public ElKassabgi data family MCP server, serving all 12 captured tools locally for tools/list and forwarding every tools/call upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when issued).
- Tools: `search_econ_series`, `get_econ_series`, `get_econ_series_metadata`, `list_econ_sources`, `get_data_freshness`, `get_econ_bundle_manifest`, `get_hf_download_link`, `get_hf_variables_dictionary`, `list_ip_bundles`, `get_ip_download_link`, `get_family_status`, `get_auth_status`.
- Upstream results pass through verbatim; upstream failures surface as `serieslib error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). Upstream endpoint overridable via `ELKASSABGI_MCP_URL`.
