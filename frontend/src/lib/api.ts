import {
  coverageRowsResponseSchema,
  coverageStateSchema,
  healthSchema,
  indexMembersSchema,
  indicesCatalogSchema,
  instrumentSchema,
  metaDefaultsSchema,
  securityInputSchema,
  signalsRequestSchema,
  signalsResponseSchema,
  latestJobSchema,
  nextCallNoResponseSchema,
  postsListResponseSchema,
  signalCellSchema,
  signalMatrixResponseSchema,
  type CoverageRowsResponse,
  type CoverageState,
  type IndexMembers,
  type IndicesCatalog,
  type Instrument,
  type LatestJob,
  type MetaDefaults,
  type NextCallNoResponse,
  type PostsListResponse,
  type SecurityInput,
  type SignalCell,
  type SignalMatrixResponse,
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
  options?: { limit?: number; refresh?: boolean; market?: "IN" | "US" }
): Promise<Instrument[]> {
  const url = new URL(`${getApiBaseUrl()}/api/instruments`);
  const q = query.trim();
  if (q) url.searchParams.set("q", q);
  if (options?.limit != null) url.searchParams.set("limit", String(options.limit));
  if (options?.refresh) url.searchParams.set("refresh", "true");
  if (options?.market) url.searchParams.set("market", options.market);
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

export async function fetchIndicesCatalog(): Promise<IndicesCatalog> {
  const res = await fetch(`${getApiBaseUrl()}/api/indices`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Could not load indices (${res.status})`));
  }
  return indicesCatalogSchema.parse(data);
}

export async function fetchIndexMembers(
  indexId: string,
  options?: { refresh?: boolean }
): Promise<IndexMembers> {
  const url = new URL(`${getApiBaseUrl()}/api/indices/${indexId}/members`);
  if (options?.refresh) url.searchParams.set("refresh", "true");
  const res = await fetch(url.toString());
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not load index members (${res.status})`)
    );
  }
  return indexMembersSchema.parse(data);
}

export async function fetchCoverage(): Promise<CoverageState> {
  const res = await fetch(`${getApiBaseUrl()}/api/coverage`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Could not load coverage (${res.status})`));
  }
  return coverageStateSchema.parse(data);
}

export async function putCoverage(body: CoverageState): Promise<CoverageState> {
  const res = await fetch(`${getApiBaseUrl()}/api/coverage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Could not save coverage (${res.status})`));
  }
  return coverageStateSchema.parse(data);
}

export async function fetchCoverageRows(): Promise<CoverageRowsResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/coverage/rows`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not load coverage rows (${res.status})`)
    );
  }
  return coverageRowsResponseSchema.parse(data);
}

export async function postCoverageRun(securities?: SecurityInput[]): Promise<{
  id: string;
  status: string;
  symbol_count: number;
  error_count: number;
  started_at: string;
  finished_at: string | null;
}> {
  const res = await fetch(`${getApiBaseUrl()}/api/coverage/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      securities?.length
        ? { securities: securityInputSchema.array().parse(securities) }
        : {}
    ),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Coverage run failed (${res.status})`));
  }
  return data as {
    id: string;
    status: string;
    symbol_count: number;
    error_count: number;
    started_at: string;
    finished_at: string | null;
  };
}

export async function fetchSignalMatrix(): Promise<SignalMatrixResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/signals/matrix`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not load signal matrix (${res.status})`)
    );
  }
  return signalMatrixResponseSchema.parse(data);
}

export async function fetchLatestJob(): Promise<LatestJob | null> {
  const res = await fetch(`${getApiBaseUrl()}/api/jobs/latest`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not load latest job (${res.status})`)
    );
  }
  if (data == null) return null;
  return latestJobSchema.parse(data);
}

export async function patchSignalStatus(
  securityId: string,
  timeframe: string,
  status: "pending" | "approved" | "skipped",
  market: "IN" | "US" = "IN"
): Promise<SignalCell> {
  const url = new URL(
    `${getApiBaseUrl()}/api/signals/${encodeURIComponent(securityId)}/${encodeURIComponent(timeframe)}`
  );
  url.searchParams.set("market", market);
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not update signal status (${res.status})`)
    );
  }
  return signalCellSchema.parse(data);
}

export async function fetchPosts(): Promise<PostsListResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/posts/`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Could not load posts (${res.status})`));
  }
  return postsListResponseSchema.parse(data);
}

export async function fetchNextCallNo(): Promise<NextCallNoResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/posts/next-call-no`);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(
      errorMessage(data, `Could not load next call number (${res.status})`)
    );
  }
  return nextCallNoResponseSchema.parse(data);
}

export async function deletePost(id: string): Promise<void> {
  const res = await fetch(
    `${getApiBaseUrl()}/api/posts/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  if (res.status === 204) return;
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, `Could not delete post (${res.status})`));
  }
  if (data && typeof data === "object" && "ok" in data && data.ok === true) {
    return;
  }
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
