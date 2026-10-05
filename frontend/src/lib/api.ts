import {
  healthSchema,
  instrumentSchema,
  metaDefaultsSchema,
  signalsRequestSchema,
  signalsResponseSchema,
  type Instrument,
  type MetaDefaults,
  type SignalsRequest,
  type SignalsResponse,
} from "@/lib/schemas";

const DEFAULT_API_URL = "http://localhost:8000";

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return DEFAULT_API_URL;
  return raw.replace(/\/$/, "");
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid JSON from API (${res.status})`);
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.detail === "string") return obj.detail;
    if (typeof obj.message === "string") return obj.message;
    if (Array.isArray(obj.detail)) {
      return obj.detail
        .map((d) =>
          typeof d === "object" && d && "msg" in d
            ? String((d as { msg: unknown }).msg)
            : String(d)
        )
        .join("; ");
    }
  }
  return fallback;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${getApiBaseUrl()}/health`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Health check failed (${res.status})`));
  }
  return healthSchema.parse(data);
}

export async function searchInstruments(
  query: string,
  options?: { limit?: number; refresh?: boolean }
): Promise<Instrument[]> {
  const url = new URL(`${getApiBaseUrl()}/api/instruments`);
  const q = query.trim();
  if (q) url.searchParams.set("q", q);
  if (options?.limit != null) url.searchParams.set("limit", String(options.limit));
  if (options?.refresh) url.searchParams.set("refresh", "true");
  const res = await fetch(url.toString());
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not search instruments (${res.status})`)
    );
  }
  return instrumentSchema.array().parse(data);
}

/** Force-refresh the backend instrument cache (does not return a full list). */
export async function refreshInstrumentCache(): Promise<void> {
  await searchInstruments("", { refresh: true, limit: 1 });
}

export async function fetchMetaDefaults(): Promise<MetaDefaults> {
  const res = await fetch(`${getApiBaseUrl()}/api/meta/defaults`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not load defaults (${res.status})`)
    );
  }
  return metaDefaultsSchema.parse(data);
}

export async function postSignals(
  body: SignalsRequest
): Promise<SignalsResponse> {
  const parsed = signalsRequestSchema.parse(body);
  const res = await fetch(`${getApiBaseUrl()}/api/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Signal request failed (${res.status})`)
    );
  }
  return signalsResponseSchema.parse(data);
}
