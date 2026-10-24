import { AxiError } from "axi-sdk-js";
import { hostOf, type SessionToken } from "../config.js";

/** Resolved auth for a single client: API key (primary) or session (fallback). */
export type ResolvedAuth =
  | { scheme: "api_key"; apiKey: string }
  | { scheme: "session"; username: string; password: string; token?: string };

export interface ClientOptions {
  baseUrl: string;
  auth: ResolvedAuth;
  /** Invoked when a fresh session token is obtained, so the caller can persist it. */
  onSession?: (token: SessionToken) => void;
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | undefined>;
  /** JSON request body. */
  body?: unknown;
  /** Form-encoded body (export endpoints take `query=<json>` as form data). */
  form?: Record<string, string>;
  /** Return raw bytes instead of parsed JSON (csv/xlsx export). */
  raw?: boolean;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class MetabaseClient {
  private sessionToken?: string;

  constructor(private readonly opts: ClientOptions) {
    if (opts.auth.scheme === "session") this.sessionToken = opts.auth.token;
  }

  get host(): string {
    return hostOf(this.opts.baseUrl);
  }

  get scheme(): "api_key" | "session" {
    return this.opts.auth.scheme;
  }

  async get<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  async post<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  /** Force a session login (session auth only). No-op for API-key auth. */
  async login(): Promise<void> {
    if (this.opts.auth.scheme !== "session") return;
    const { username, password } = this.opts.auth;
    const res = await this.rawFetch("POST", "/api/session", {
      json: { username, password },
    });
    if (!res.ok) {
      throw mapHttpError(res.status, await safeText(res), this.host, "POST /api/session");
    }
    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new AxiError("Session login returned no token", "AUTH", [
        "Verify the username/password for this profile",
      ]);
    }
    this.sessionToken = data.id;
    this.opts.onSession?.({ token: data.id, obtained_at: new Date().toISOString() });
  }

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.opts.auth.scheme === "api_key") {
      return { "X-API-Key": this.opts.auth.apiKey };
    }
    if (!this.sessionToken) await this.login();
    return { "X-Metabase-Session": this.sessionToken as string };
  }

  private async request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const exec = async () =>
      this.rawFetch(method, path, {
        query: opts.query,
        json: opts.body,
        form: opts.form,
        timeoutMs: opts.timeoutMs,
        headers: await this.authHeaders(),
      });

    let res = await exec();
    if (res.status === 401 && this.opts.auth.scheme === "session") {
      this.sessionToken = undefined; // expired — re-auth once, transparently
      res = await exec();
    }
    if (!res.ok) {
      throw mapHttpError(res.status, await safeText(res), this.host, `${method} ${path}`);
    }
    if (opts.raw) {
      return Buffer.from(await res.arrayBuffer()) as unknown as T;
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private async rawFetch(
    method: string,
    path: string,
    init: {
      query?: RequestOptions["query"];
      json?: unknown;
      form?: Record<string, string>;
      timeoutMs?: number;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    const url = this.opts.baseUrl.replace(/\/$/, "") + path + queryString(init.query);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      init.timeoutMs ?? this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
    let body: string | undefined;
    if (init.json !== undefined) {
      body = JSON.stringify(init.json);
      headers["Content-Type"] = "application/json";
    } else if (init.form) {
      body = new URLSearchParams(init.form).toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    try {
      return await fetch(url, { method, headers, body, signal: controller.signal });
    } catch {
      throw new AxiError(`Cannot reach Metabase at ${this.host}`, "UNREACHABLE", [
        "Check the instance URL and your network/VPN",
        "Run `metabase-axi doctor` to diagnose",
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Helpers ─────────────────────────────────────────────────────────────
function queryString(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** Pull a human message out of a Metabase error body (JSON `{message}` or a bare string). */
export function extractMessage(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return cap(parsed);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const msg = obj.message ?? obj.error ?? obj.cause;
      if (typeof msg === "string") return cap(msg);
    }
  } catch {
    return cap(trimmed);
  }
  return undefined;
}

function cap(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}… (truncated, ${s.length} chars total)` : s;
}

export function mapHttpError(
  status: number,
  bodyText: string,
  host: string,
  where: string,
): AxiError {
  const serverMsg = extractMessage(bodyText);
  switch (status) {
    case 401:
      return new AxiError(`Authentication failed (${where})`, "AUTH", [
        "Run `metabase-axi doctor` to check credentials",
        "Re-run `metabase-axi auth login` or verify the API key",
      ]);
    case 403:
      return new AxiError(`Forbidden${serverMsg ? `: ${serverMsg}` : ` (${where})`}`, "FORBIDDEN", [
        "The API key / user lacks permission for this object",
      ]);
    case 404:
      return new AxiError(`Not found (${where})`, "NOT_FOUND", [
        "Check the id; use `search` or a `list` command to find it",
      ]);
    case 400:
    case 422:
      return new AxiError(
        serverMsg ? `Query error: ${serverMsg}` : `Bad request (${where})`,
        "QUERY_ERROR",
        ["Check the SQL/MBQL and any parameters"],
      );
    default:
      return new AxiError(
        `Metabase returned ${status} (${where})${serverMsg ? `: ${serverMsg}` : ""}`,
        "HTTP_ERROR",
        [`Host: ${host}`],
      );
  }
}
