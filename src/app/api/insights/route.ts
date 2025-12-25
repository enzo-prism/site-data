import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { normalizeDomain } from "@/lib/domain";
import { checkRateLimit, cleanupRateLimit } from "@/lib/rateLimit";
import {
  fetchSimilarwebInsights,
  insightModeSchema,
} from "@/lib/similarweb";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  url: z.string().min(1),
  mode: insightModeSchema.optional().default("monthly"),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters." },
      { status: 400 }
    );
  }

  const normalized = normalizeDomain(parsed.data.url);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  cleanupRateLimit();
  const ip = getClientIp(request);
  const rate = checkRateLimit(ip, 20, 10 * 60 * 1000);
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": retryAfter.toString() } }
    );
  }

  try {
    const insights = await fetchSimilarwebInsights(
      normalized.domain,
      parsed.data.mode
    );

    return NextResponse.json({
      domain: normalized.domain,
      mode: parsed.data.mode,
      summary: insights.summary,
      timeseries: insights.timeseries,
      channels: insights.channels,
      meta: {
        provider: "Similarweb",
        fetchedAt: new Date().toISOString(),
        partial: insights.meta.partial,
        notes: insights.meta.notes,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch Similarweb data." },
      { status: 500 }
    );
  }
}
