import { AxiError } from "axi-sdk-js";

const API_BASE = process.env.CLOCKIFY_API_BASE ?? "https://api.clockify.me/api/v1";
const REPORTS_BASE = process.env.CLOCKIFY_REPORTS_API_BASE ?? "https://reports.api.clockify.me/v1";

function apiKey(): string {
  const key = process.env.CLOCKIFY_API_KEY;
  if (!key) {
    throw new AxiError("CLOCKIFY_API_KEY is not set", "missing_api_key", [
      "Generate a key: Clockify → Preferences → Advanced → Manage API keys",
      "Export it: export CLOCKIFY_API_KEY=<key>",
    ]);
  }
  return key;
}

function query(params?: Record<string, string | string[] | undefined>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.set(key, value);
    }
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

async function request(base: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const key = apiKey();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-api-key": key, ...(init.headers ?? {}) },
    });
  } catch (error) {
    throw new AxiError(`Could not reach Clockify: ${(error as Error).message}`, "api_unavailable", [
      "Check your network connection",
    ]);
  }

  const bodyText = await response.text();
  let body: unknown;
  try {
    body = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const message = (body as { message?: string } | undefined)?.message ?? bodyText.slice(0, 300) ?? `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new AxiError(`Clockify authentication failed: ${message}`, "auth_failed", [
        "Check CLOCKIFY_API_KEY is a valid, non-expired key",
      ]);
    }
    throw new AxiError(message, "api_error");
  }
  return body;
}

export function get(path: string, params?: Record<string, string | string[] | undefined>): Promise<unknown> {
  return request(API_BASE, `${path}${query(params)}`, { method: "GET" });
}

export function post(path: string, json: Record<string, unknown>): Promise<unknown> {
  return request(API_BASE, path, { method: "POST", body: JSON.stringify(json) });
}

export function patch(path: string, json: Record<string, unknown>): Promise<unknown> {
  return request(API_BASE, path, { method: "PATCH", body: JSON.stringify(json) });
}

export function del(path: string): Promise<unknown> {
  return request(API_BASE, path, { method: "DELETE" });
}

export function reportsPost(path: string, json: Record<string, unknown>): Promise<unknown> {
  return request(REPORTS_BASE, path, { method: "POST", body: JSON.stringify(json) });
}
