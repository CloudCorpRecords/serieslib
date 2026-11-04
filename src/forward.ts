/**
 * serieslib core: a forwarding client for the public
 * ElKassabgi data family MCP server.
 *
 * This module computes nothing locally. tools/list is
 * served from the literal tool definitions below, taken
 * verbatim from a live capture of the upstream server
 * (name, title, description and inputSchema exactly as
 * captured; the capture's annotations are not
 * reproduced). A tools/call is forwarded over a
 * streamable-HTTP JSON-RPC session: an initialize POST,
 * a notifications/initialized POST, then the tools/call
 * POST, honouring the Mcp-Session-Id response header
 * when the upstream issues one. The session is
 * established lazily on the first forwarded call and
 * reused for the lifetime of the client.
 *
 * The upstream endpoint defaults to
 * https://elkassabgidata-mcp.elkassabgi.workers.dev/mcp
 * and can be overridden with the ELKASSABGI_MCP_URL
 * environment variable (that override is a labelled
 * reconstruction). No credential is sent by this client;
 * the upstream's own key handling, where a tool needs
 * one, stays upstream, and get_auth_status simply
 * forwards like every other tool.
 *
 * Upstream results pass through verbatim, including any
 * isError flag and any extra result fields. Failures —
 * a JSON-RPC error from the upstream, a non-2xx status,
 * an unparseable response, or a fetch that throws or
 * times out — surface as an isError result whose text
 * starts with `serieslib error:` (that rendering is a
 * labelled reconstruction). Responses may be plain JSON
 * or SSE (data: lines); the JSON-RPC message with the
 * matching id wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL =
  "https://elkassabgidata-mcp.elkassabgi.workers.dev/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/elkassabgidata-tools-original.json)     */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "search_econ_series",
    "title": "Search Economic Series",
    "description": "Search the Econ Data Library catalog (billions of series from hundreds of sources: national accounts, prices, trade, labor, energy, markets…). Free, no key needed. Returns series ids usable with get_econ_series. Page with offset; lang returns source-official translated titles where the publisher provides them.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "minLength": 2,
          "description": "Free-text search, e.g. 'germany inflation' or 'GDP per capita'"
        },
        "source": {
          "type": "string",
          "description": "Restrict to one source id, e.g. 'worldbank', 'ecb', 'imf_weo'"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "default": 15,
          "description": "Maximum number of catalog results to return."
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "default": 0,
          "description": "Skip this many results (paging). The API caps how deep it pages and says so if exceeded."
        },
        "lang": {
          "type": "string",
          "enum": [
            "en",
            "ar",
            "es",
            "fr",
            "ru",
            "zh"
          ],
          "default": "en",
          "description": "Title language. Only official translations are shown; a title without one stays in English."
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "get_econ_series",
    "title": "Download Economic Series",
    "description": "Download an economic time series as rows (long format: date, value) with its citation and license. REQUIRES the free ElkassabgiData API key. Use date_from/date_to to window long series.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "series_id": {
          "type": "string",
          "description": "Exact catalog id from search_econ_series, e.g. 'worldbank:NY.GDP.MKTP.CD:DEU'"
        },
        "date_from": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Start of the date window to return, as an ISO date (inclusive)."
        },
        "date_to": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "End of the date window to return, as an ISO date (inclusive)."
        },
        "max_rows": {
          "type": "integer",
          "minimum": 10,
          "maximum": 2000,
          "default": 400,
          "description": "Maximum number of data rows to return."
        }
      },
      "required": [
        "series_id"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "get_econ_series_metadata",
    "title": "Economic Series Metadata",
    "description": "Full metadata for one econ series: title, frequency, geography, unit, license (incl. commercial-use flag), attribution/citation, coverage dates. Free, no key needed.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "series_id": {
          "type": "string",
          "description": "Exact catalog series id, as returned by search_econ_series."
        }
      },
      "required": [
        "series_id"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "list_econ_sources",
    "title": "List Economic Data Sources",
    "description": "List the Econ Data Library's sources (statistical offices, monetary authorities, IGOs, research datasets) with their licenses, counted live. Free.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "contains": {
          "type": "string",
          "description": "Case-insensitive filter on source id/name, e.g. 'bank' or 'imf'"
        }
      },
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "get_data_freshness",
    "title": "Data Freshness",
    "description": "Live per-source update status straight from the automated updater's ledger: last successful update, data frontier, and honest stale/failure flags (dates are NEVER fabricated — a silent upstream outage shows here as stale, not papered over). Free.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "description": "One source id; omit for the full board"
        }
      },
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "get_econ_bundle_manifest",
    "title": "Economic Data Bundle Manifest",
    "description": "A citable bundle manifest (Frictionless data package) for several econ series - up to 50 explicit ids, or every series of one small source (up to 1,000 series): the per-series download URLs grouped by source, each source's attribution and licence, and any id that could not be resolved (reported, never dropped). The URLs serve the CURRENT data - this is not a frozen vintage. Free, no key needed for the manifest; downloading the URLs needs the key.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ids": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 3
          },
          "minItems": 1,
          "maxItems": 50,
          "description": "Up to 50 exact catalog ids from search_econ_series"
        },
        "source": {
          "type": "string",
          "description": "One source id - every series of that source, if it has at most 1,000"
        }
      },
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "get_hf_download_link",
    "title": "HF Equity Data Download Link",
    "description": "Authenticated download instructions for HF Data Library's 1-minute OHLCV bars (per-ticker US stocks/ETFs from IEX Exchange HIST, 2022-03-07 to the present; parquet or csv) or the 25 pre-computed academic variables. Each file holds all of a ticker's bars, so it is fetched by YOUR code, not returned inline. The data is provided for academic research; relay that notice with the link. Works with the same ElkassabgiData key.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ticker": {
          "type": "string",
          "pattern": "^[A-Za-z0-9.]{1,10}$",
          "description": "e.g. AAPL, SPY"
        },
        "dataset": {
          "type": "string",
          "enum": [
            "bars",
            "variables",
            "quality"
          ],
          "default": "bars",
          "description": "Which HF dataset to download: bars (1-minute OHLCV), variables (pre-computed academic variables) or quality."
        },
        "version": {
          "type": "string",
          "enum": [
            "clean",
            "raw"
          ],
          "default": "clean",
          "description": "Data version to download: clean (processed) or raw (as received)."
        },
        "format": {
          "type": "string",
          "enum": [
            "parquet",
            "csv"
          ],
          "default": "parquet",
          "description": "csv only applies to bars"
        }
      },
      "required": [
        "ticker"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "get_hf_variables_dictionary",
    "title": "HF Variables Dictionary",
    "description": "The exact definitions/formulas of HF Data Library's 25 pre-computed academic variables (realized volatility family, spreads, jumps, liquidity, data-quality). Verbatim from the published dictionary. Free.",
    "inputSchema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "list_ip_bundles",
    "title": "IP Data Library Bundles",
    "description": "List the IP Data Library's snapshot-pinned patent/innovation bundles (patent-level measures on US patents; assignee-year panels) with sizes, vintages and download paths. Free, no key needed.",
    "inputSchema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "get_ip_download_link",
    "title": "IP Patent Data Download Link",
    "description": "Authenticated download instructions for an IP Data Library bundle — patent-level innovation measures (citations, originality/generality, grant lag, team size) or the assignee-year panel. Parquet, full-history files fetched by YOUR code, not returned inline. Works with the same ElkassabgiData key as every family library.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "file": {
          "type": "string",
          "enum": [
            "patent_measures.parquet",
            "assignee_year.parquet"
          ],
          "description": "Which IP Data Library bundle file to download: patent_measures.parquet (patent-level measures) or assignee_year.parquet (assignee-year panel)."
        },
        "vintage": {
          "type": "string",
          "pattern": "^v[\\w.-]+$",
          "description": "Snapshot vintage from list_ip_bundles; omit for the newest"
        }
      },
      "required": [
        "file"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "get_family_status",
    "title": "ElkassabgiData Family Status",
    "description": "Live status of the whole ElkassabgiData family - HF, Econ and IP: each library's headline stats and data currency, read live. Free.",
    "inputSchema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "get_auth_status",
    "title": "Authentication Status",
    "description": "Whether this MCP connection has an ElkassabgiData API key configured (masked — the key itself is never echoed), and how to add one.",
    "inputSchema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {}
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` is one of the captured tools. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `serieslib error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Parse a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * one is present, else the last parseable message, else
 * null when nothing parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON; ignore this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding one upstream session. The
 * session is established lazily on the first forwarded
 * call and reused for the lifetime of the client (the
 * process lifetime when the client is the MCP server's
 * or a one-shot client for the CLI).
 */
export class SerieslibClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).ELKASSABGI_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "serieslib", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // The notification response body carries nothing we need.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Pass the upstream result through verbatim.
    return result;
  }
}

/** Create a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): SerieslibClient {
  return new SerieslibClient(deps);
}

/** One-shot helper: a fresh client per call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new SerieslibClient(deps).callTool(name, args);
}
