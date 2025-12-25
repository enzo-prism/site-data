import { z } from "zod";

export const insightModeSchema = z.enum(["monthly", "last28"]);
export type InsightMode = z.infer<typeof insightModeSchema>;

export type TimeseriesPoint = { date: string; value: number };
export type ChannelShare = { channel: string; share: number };

export type InsightsData = {
  summary: {
    latestVisits?: number;
    latestBounceRate?: number;
    latestPagesPerVisit?: number;
    latestAvgDurationSeconds?: number;
  };
  timeseries: {
    visits: TimeseriesPoint[];
    bounceRate: TimeseriesPoint[];
    pagesPerVisit: TimeseriesPoint[];
    avgDuration: TimeseriesPoint[];
  };
  channels: ChannelShare[];
  meta: {
    partial: boolean;
    notes: string[];
  };
};

const SIMILARWEB_BASE = "https://api.similarweb.com/v1/website";
const REQUEST_TIMEOUT_MS = 10_000;

const pointSchema = z.object({
  date: z.string(),
  value: z.number().nullable(),
});

const channelItemSchema = z.object({
  channel: z.string().optional(),
  source: z.string().optional(),
  name: z.string().optional(),
  share: z.number().optional(),
  value: z.number().optional(),
});

export function getMonthlyRange(now: Date = new Date()): {
  start: string;
  end: string;
} {
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  anchor.setUTCMonth(anchor.getUTCMonth() - 1);
  const end = new Date(anchor);
  const start = new Date(anchor);
  start.setUTCMonth(start.getUTCMonth() - 2);

  return {
    start: formatYearMonth(start),
    end: formatYearMonth(end),
  };
}

function formatYearMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildQuery(mode: InsightMode): URLSearchParams {
  const apiKey = process.env.SIMILARWEB_API_KEY;
  if (!apiKey) {
    throw new Error("SIMILARWEB_API_KEY is not configured.");
  }

  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("granularity", mode === "last28" ? "daily" : "monthly");

  if (mode === "monthly") {
    const range = getMonthlyRange();
    params.set("start_date", range.start);
    params.set("end_date", range.end);
  }

  return params;
}

function buildHeaders(): HeadersInit {
  const apiKey = process.env.SIMILARWEB_API_KEY;
  const sendHeader = process.env.SIMILARWEB_API_KEY_IN_HEADER === "true";
  if (!apiKey || !sendHeader) {
    return {};
  }
  return { "api-key": apiKey };
}

async function fetchWithTimeout(url: string, headers: HeadersInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Similarweb responded with ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractArray(raw: unknown, key: string): unknown[] | null {
  if (!raw) {
    return null;
  }

  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw !== "object") {
    return null;
  }

  const value = (raw as Record<string, unknown>)[key];
  if (Array.isArray(value)) {
    return value;
  }

  const nestedData = (raw as Record<string, unknown>).data;
  if (nestedData && typeof nestedData === "object") {
    const nestedValue = (nestedData as Record<string, unknown>)[key];
    if (Array.isArray(nestedValue)) {
      return nestedValue;
    }
  }

  if (value && typeof value === "object") {
    const nested = (value as Record<string, unknown>).data;
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  return null;
}

function parseSeries(raw: unknown, keys: string[]): TimeseriesPoint[] | null {
  const keyList = keys.length ? keys : ["data"];

  for (const key of keyList) {
    const candidate = extractArray(raw, key);
    if (!candidate) {
      continue;
    }

    const parsed = z.array(pointSchema).safeParse(candidate);
    if (parsed.success) {
      const points = parsed.data
        .filter((point): point is { date: string; value: number } =>
          typeof point.value === "number"
        )
        .map((point) => ({
          date: point.date,
          value: point.value,
        }));

      if (points.length) {
        return points;
      }
    }
  }

  return null;
}

function normalizeShare(value: number): number {
  if (value > 1) {
    return value / 100;
  }
  return value;
}

function parseChannels(raw: unknown): ChannelShare[] | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = (raw as Record<string, unknown>).data ?? raw;

  if (Array.isArray(data)) {
    const parsed = z.array(channelItemSchema).safeParse(data);
    if (!parsed.success) {
      return null;
    }

    const channels = parsed.data
      .map((item) => {
        const label = item.channel || item.source || item.name;
        const share = item.share ?? item.value;
        if (!label || typeof share !== "number") {
          return null;
        }
        return { channel: label, share: normalizeShare(share) };
      })
      .filter((item): item is ChannelShare => Boolean(item));

    return channels.length ? channels : null;
  }

  if (data && typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>)
      .map(([key, value]) => {
        if (typeof value !== "number") {
          return null;
        }
        return { channel: key, share: normalizeShare(value) };
      })
      .filter((entry): entry is ChannelShare => Boolean(entry));

    return entries.length ? entries : null;
  }

  return null;
}

function latestValue(series: TimeseriesPoint[]): number | undefined {
  if (!series.length) {
    return undefined;
  }

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1]?.value;
}

export async function fetchSimilarwebInsights(
  domain: string,
  mode: InsightMode
): Promise<InsightsData> {
  const params = buildQuery(mode);
  const headers = buildHeaders();

  const endpoints = {
    visits: "total-traffic-and-engagement/visits",
    bounceRate: "total-traffic-and-engagement/bounce-rate",
    pagesPerVisit: "total-traffic-and-engagement/pages-per-visit",
    avgDuration: "total-traffic-and-engagement/average-visit-duration",
    channels: "traffic-sources/overview-share",
  };

  const tasks = {
    visits: fetchWithTimeout(
      `${SIMILARWEB_BASE}/${domain}/${endpoints.visits}?${params.toString()}`,
      headers
    ),
    bounceRate: fetchWithTimeout(
      `${SIMILARWEB_BASE}/${domain}/${endpoints.bounceRate}?${params.toString()}`,
      headers
    ),
    pagesPerVisit: fetchWithTimeout(
      `${SIMILARWEB_BASE}/${domain}/${endpoints.pagesPerVisit}?${params.toString()}`,
      headers
    ),
    avgDuration: fetchWithTimeout(
      `${SIMILARWEB_BASE}/${domain}/${endpoints.avgDuration}?${params.toString()}`,
      headers
    ),
    channels: fetchWithTimeout(
      `${SIMILARWEB_BASE}/${domain}/${endpoints.channels}?${params.toString()}`,
      headers
    ),
  };

  const results = await Promise.allSettled(Object.values(tasks));
  const keys = Object.keys(tasks) as Array<keyof typeof tasks>;
  const seriesKeyMap: Record<
    Exclude<keyof typeof tasks, "channels">,
    string[]
  > = {
    visits: ["visits", "data"],
    bounceRate: ["bounce_rate", "bounceRate", "data"],
    pagesPerVisit: ["pages_per_visit", "pagesPerVisit", "data"],
    avgDuration: ["average_visit_duration", "avgDuration", "data"],
  };

  const notes: string[] = [];
  const timeseries = {
    visits: [] as TimeseriesPoint[],
    bounceRate: [] as TimeseriesPoint[],
    pagesPerVisit: [] as TimeseriesPoint[],
    avgDuration: [] as TimeseriesPoint[],
  };
  let channels: ChannelShare[] = [];

  results.forEach((result, index) => {
    const key = keys[index];
    if (result.status === "rejected") {
      notes.push(`${key} data unavailable.`);
      return;
    }

    const raw = result.value;

    if (key === "channels") {
      const parsed = parseChannels(raw);
      if (!parsed) {
        notes.push("channels data unavailable.");
      } else {
        channels = parsed.sort((a, b) => b.share - a.share);
      }
      return;
    }

    const parsedSeries = parseSeries(
      raw,
      seriesKeyMap[key as Exclude<typeof key, "channels">]
    );
    if (!parsedSeries) {
      notes.push(`${key} data unavailable.`);
      return;
    }

    if (key === "visits") {
      timeseries.visits = parsedSeries;
    }
    if (key === "bounceRate") {
      timeseries.bounceRate = parsedSeries;
    }
    if (key === "pagesPerVisit") {
      timeseries.pagesPerVisit = parsedSeries;
    }
    if (key === "avgDuration") {
      timeseries.avgDuration = parsedSeries;
    }
  });

  const summary = {
    latestVisits: latestValue(timeseries.visits),
    latestBounceRate: latestValue(timeseries.bounceRate),
    latestPagesPerVisit: latestValue(timeseries.pagesPerVisit),
    latestAvgDurationSeconds: latestValue(timeseries.avgDuration),
  };

  return {
    summary,
    timeseries,
    channels,
    meta: {
      partial:
        notes.length > 0 ||
        (!timeseries.visits.length &&
          !timeseries.bounceRate.length &&
          !timeseries.pagesPerVisit.length &&
          !timeseries.avgDuration.length &&
          !channels.length),
      notes,
    },
  };
}
