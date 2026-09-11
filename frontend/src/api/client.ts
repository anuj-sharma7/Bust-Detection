/**
 * Thin API abstraction.
 *
 * Every network call in the app goes through `request`, so retries, error
 * shaping and the base URL are defined once. Responses are cached by URL
 * because the demonstration dataset is deterministic - the same selection
 * always yields the same payload, so re-fetching it on every navigation is
 * pure waste.
 */

import type {
  AlertsResponse,
  ClimateProfile,
  ForecastVerification,
  Meta,
  NetworkResponse,
  RiskResponse,
  Selection,
  SourcesResponse,
  SystemStatus,
  VerificationResponse,
} from './types';

const BASE = '/api';

/**
 * Static snapshot mode.
 *
 * A build can embed pre-fetched API responses on `window`, letting the whole
 * dashboard run with no backend - useful for a shared read-only deployment or
 * an air-gapped review copy. When a snapshot is present the client serves from
 * it and never touches the network; when it is absent, nothing changes.
 *
 * Keys are canonical: path plus alphabetically sorted query parameters, so the
 * exporter and the client agree without depending on argument order.
 */
declare global {
  interface Window {
    __ATMOSGUARD_SNAPSHOT__?: Record<string, unknown>;
  }
}

function snapshot(): Record<string, unknown> | undefined {
  return typeof window === 'undefined' ? undefined : window.__ATMOSGUARD_SNAPSHOT__;
}

export function isSnapshotMode(): boolean {
  return snapshot() !== undefined;
}

function canonicalKey(path: string, params: URLSearchParams): string {
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const qs = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  return qs ? `${path}?${qs}` : path;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

async function request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const snap = snapshot();
  if (snap) {
    const key = canonicalKey(path, query);
    if (key in snap) return snap[key] as T;
    throw new ApiError(
      'This combination is not included in the static preview. Run the full ' +
        'application to explore every location, variable and model.',
      404,
      key,
    );
  }

  const qs = query.toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;

  if (cache.has(url)) return cache.get(url) as T;
  // De-duplicate concurrent requests for the same URL: the dashboard mounts
  // several panels at once and they routinely ask for the same payload.
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (cause) {
      throw new ApiError(
        'Cannot reach the AtmosGuard API. Is the backend running on port 8000?',
        0,
        url,
      );
    }

    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const body = await response.json();
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : detail;
      } catch {
        /* response had no JSON body; the status line is the best we have */
      }
      throw new ApiError(detail, response.status, url);
    }

    const data = (await response.json()) as T;
    cache.set(url, data);
    return data;
  })();

  inflight.set(url, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(url);
  }
}

export const api = {
  meta: () => request<Meta>('/meta'),

  risk: (selection: Selection) =>
    request<RiskResponse>('/risk', {
      location: selection.location_id,
      variable: selection.variable_id,
      model: selection.model_id,
      horizon: selection.horizon,
      forecast_date: selection.base_date,
    }),

  scenario: (id: string) => request<RiskResponse>(`/scenario/${id}`),

  network: (selection: Pick<Selection, 'variable_id' | 'model_id' | 'horizon' | 'base_date'>) =>
    request<NetworkResponse>('/network', {
      variable: selection.variable_id,
      model: selection.model_id,
      horizon: selection.horizon,
      forecast_date: selection.base_date,
    }),

  alerts: (baseDate: string, severity?: string) =>
    request<AlertsResponse>('/alerts', { forecast_date: baseDate, severity }),

  modelVerification: (baseDate: string) =>
    request<VerificationResponse>('/verification/model', { forecast_date: baseDate }),

  forecastVerification: (locationId: string, variableId: string, baseDate: string, lookback = 21) =>
    request<ForecastVerification & { location_id: string; variable_id: string; label: string }>(
      '/verification/forecast',
      { location: locationId, variable: variableId, forecast_date: baseDate, lookback },
    ),

  systemStatus: (baseDate: string) => request<SystemStatus>('/system/status', { forecast_date: baseDate }),

  climate: (locationId: string) => request<ClimateProfile>(`/climate/${locationId}`),

  sources: () => request<SourcesResponse>('/sources'),
};
