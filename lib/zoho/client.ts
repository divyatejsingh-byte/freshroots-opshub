import "server-only";

/**
 * Minimal Zoho Inventory client (no SDK): OAuth refresh-token flow, paging, error handling.
 * Env: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID, ZOHO_DC (in | com | eu | com.au | jp | ca | sa; default in).
 * ZOHO_ACCOUNTS_URL and ZOHO_API_URL override the base URLs (for a sandbox or a test double).
 */

export const REQUIRED_ENV = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORG_ID"] as const;

export const zohoDataCenter = () => process.env.ZOHO_DC ?? "in";
const accountsUrl = () => (process.env.ZOHO_ACCOUNTS_URL ?? `https://accounts.zoho.${zohoDataCenter()}`).replace(/\/$/, "");
const apiUrl = () => (process.env.ZOHO_API_URL ?? `https://www.zohoapis.${zohoDataCenter()}/inventory/v1`).replace(/\/$/, "");

export const zohoOrgId = () => process.env.ZOHO_ORG_ID ?? "";
export const zohoMissingEnv = () => REQUIRED_ENV.filter((k) => !process.env[k]);
export const zohoConfigured = () => zohoMissingEnv().length === 0;

/** fetch that explains a network failure instead of surfacing "fetch failed" */
async function reach(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ZohoError(`Could not reach Zoho at ${new URL(url).host}. Check ZOHO_DC (your data centre) and your network.`);
  }
}

export class ZohoError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: number) {
    super(message);
  }
}

// A refresh token may mint only 10 access tokens per 10 minutes, so reuse one until it nears expiry
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await reach(`${accountsUrl()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN ?? "",
      client_id: process.env.ZOHO_CLIENT_ID ?? "",
      client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new ZohoError(`Zoho sign-in failed: ${json.error ?? res.status}. Check the client ID, secret, refresh token and data centre.`, res.status);
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function zohoGet<T = Record<string, unknown>>(path: string, params: Record<string, string | number> = {}, withOrg = true): Promise<T> {
  const query = new URLSearchParams({ ...(withOrg ? { organization_id: zohoOrgId() } : {}), ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const call = async (token: string) =>
    reach(`${apiUrl()}${path}?${query}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, cache: "no-store" });

  let res = await call(await accessToken());
  if (res.status === 401) res = await call(await accessToken(true)); // token revoked or expired early
  if (res.status === 429) throw new ZohoError("Zoho rate limit reached. Wait a minute and sync again.", 429);

  const json = (await res.json().catch(() => null)) as (T & { code?: number; message?: string }) | null;
  if (!json) throw new ZohoError(`Zoho returned an unreadable response (${res.status})`, res.status);
  if (!res.ok || (typeof json.code === "number" && json.code !== 0)) throw new ZohoError(`Zoho: ${json.message ?? `HTTP ${res.status}`}`, res.status, json.code);
  return json;
}

/** Reads every page of a list endpoint */
export async function zohoPaged<T>(path: string, key: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const perPage = 200;
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const json = await zohoGet<Record<string, unknown>>(path, { ...params, page, per_page: perPage });
    const rows = (json[key] as T[] | undefined) ?? [];
    out.push(...rows);
    const more = (json.page_context as { has_more_page?: boolean } | undefined)?.has_more_page;
    if (more === false || (more === undefined && rows.length < perPage)) break;
  }
  return out;
}
