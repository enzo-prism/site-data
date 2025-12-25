"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  formatCompactNumber,
  formatDateLabel,
  formatDuration,
  formatPercent,
  normalizePercent,
} from "@/lib/format";

type Mode = "monthly" | "last28";

type InsightsResponse = {
  domain: string;
  mode: Mode;
  summary: {
    latestVisits?: number;
    latestBounceRate?: number;
    latestPagesPerVisit?: number;
    latestAvgDurationSeconds?: number;
  };
  timeseries: {
    visits: Array<{ date: string; value: number }>;
    bounceRate: Array<{ date: string; value: number }>;
    pagesPerVisit: Array<{ date: string; value: number }>;
    avgDuration: Array<{ date: string; value: number }>;
  };
  channels: Array<{ channel: string; share: number }>;
  meta: {
    provider: "Similarweb";
    fetchedAt: string;
    partial: boolean;
    notes?: string[];
  };
};

const MODE_LABELS: Record<Mode, string> = {
  monthly: "Monthly (last 3 full months)",
  last28: "Last 28 days",
};

const chartPalette = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const visitsChartConfig = {
  visits: {
    label: "Visits",
    color: "hsl(var(--chart-1))",
  },
};

const bounceChartConfig = {
  bounce: {
    label: "Bounce Rate",
    color: "hsl(var(--chart-2))",
  },
};

const pagesChartConfig = {
  pages: {
    label: "Pages / Visit",
    color: "hsl(var(--chart-3))",
  },
};

const durationChartConfig = {
  duration: {
    label: "Avg. Duration",
    color: "hsl(var(--chart-4))",
  },
};

const channelsChartConfig = {
  share: {
    label: "Share",
    color: "hsl(var(--chart-5))",
  },
};

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastQueryRef = useRef<string | null>(null);

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("monthly");
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const queryUrl = searchParams.get("url") ?? "";
  const queryMode = (searchParams.get("mode") as Mode) ?? "monthly";

  const hasCoverage = Boolean(
    data &&
      (data.timeseries.visits.length ||
        data.timeseries.bounceRate.length ||
        data.timeseries.pagesPerVisit.length ||
        data.timeseries.avgDuration.length ||
        data.channels.length)
  );

  const visitsSeries = useMemo(
    () =>
      data?.timeseries.visits.map((point) => ({
        date: point.date,
        visits: point.value,
      })) ?? [],
    [data]
  );

  const bounceSeries = useMemo(
    () =>
      data?.timeseries.bounceRate
        .map((point) => ({
          date: point.date,
          bounce: normalizePercent(point.value),
        }))
        .filter(
          (point): point is { date: string; bounce: number } =>
            typeof point.bounce === "number"
        ) ?? [],
    [data]
  );

  const pagesSeries = useMemo(
    () =>
      data?.timeseries.pagesPerVisit.map((point) => ({
        date: point.date,
        pages: point.value,
      })) ?? [],
    [data]
  );

  const durationSeries = useMemo(
    () =>
      data?.timeseries.avgDuration.map((point) => ({
        date: point.date,
        duration: point.value,
      })) ?? [],
    [data]
  );

  const channelSeries = useMemo(
    () =>
      data?.channels.map((item) => ({
        channel: item.channel,
        share: item.share > 1 ? item.share : item.share * 100,
      })) ?? [],
    [data]
  );

  const buildSharePath = useCallback((nextUrl: string, nextMode: Mode) => {
    const params = new URLSearchParams();
    params.set("url", nextUrl);
    params.set("mode", nextMode);
    return `/?${params.toString()}`;
  }, []);

  const updateQuery = useCallback(
    (nextUrl: string, nextMode: Mode) => {
      const sharePath = buildSharePath(nextUrl, nextMode);
      router.replace(sharePath, { scroll: false });
    },
    [buildSharePath, router]
  );

  const loadInsights = useCallback(
    async (targetUrl: string, targetMode: Mode, syncQuery = true) => {
      setLoading(true);
      setHasSearched(true);

      try {
        const response = await fetch(
          `/api/insights?url=${encodeURIComponent(
            targetUrl
          )}&mode=${targetMode}`
        );
        const payload = await response.json();

        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof (payload as { error?: string }).error === "string"
              ? (payload as { error: string }).error
              : "Unable to fetch insights.";
          throw new Error(message);
        }

        setData(payload as InsightsResponse);
        if (syncQuery) {
          updateQuery(targetUrl, targetMode);
        }
      } catch (error) {
        setData(null);
        const message =
          error instanceof Error
            ? error.message
            : "Unable to fetch insights.";
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [updateQuery]
  );

  const handleAnalyze = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Enter a website URL to analyze.");
      return;
    }

    lastQueryRef.current = `${trimmed}:${mode}`;
    void loadInsights(trimmed, mode);
  }, [loadInsights, mode, url]);

  const handleModeChange = useCallback(
    (value: string) => {
      const nextMode = (value as Mode) || "monthly";
      setMode(nextMode);
      const trimmed = url.trim();
      if (trimmed) {
        lastQueryRef.current = `${trimmed}:${nextMode}`;
        void loadInsights(trimmed, nextMode);
      }
    },
    [loadInsights, url]
  );

  const handleCopyLink = useCallback(() => {
    if (!url.trim()) {
      toast.error("Add a URL first.");
      return;
    }

    const sharePath = buildSharePath(url.trim(), mode);
    const shareUrl = `${window.location.origin}${sharePath}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => toast.success("Share link copied."))
      .catch(() => toast.error("Unable to copy link."));
  }, [buildSharePath, mode, url]);

  useEffect(() => {
    if (!queryUrl) {
      return;
    }

    const modeParam: Mode = queryMode === "last28" ? "last28" : "monthly";
    const queryKey = `${queryUrl}:${modeParam}`;

    if (lastQueryRef.current === queryKey) {
      return;
    }

    lastQueryRef.current = queryKey;
    setUrl(queryUrl);
    setMode(modeParam);
    void loadInsights(queryUrl, modeParam, false);
  }, [loadInsights, queryMode, queryUrl]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
          <header className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  SitePulse
                </p>
                <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                  Instant marketing and traffic snapshots.
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground">
                  Enter a website to pull Similarweb estimates for visits,
                  engagement, and channel mix. Built for quick competitive pulse
                  checks.
                </p>
              </div>
              <Badge className="w-fit" variant="secondary">
                Estimates - Coverage varies
              </Badge>
            </div>
            <Card className="border-muted/60 shadow-sm">
              <CardContent className="space-y-6 pt-6">
                <form
                  className="grid gap-4 lg:grid-cols-[1fr_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAnalyze();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="url">Website URL or domain</Label>
                    <Input
                      id="url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="example.com or https://www.example.com"
                      disabled={loading}
                    />
                  </div>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                    <Button
                      type="submit"
                      className="w-full lg:w-auto"
                      disabled={loading}
                    >
                      Analyze
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full lg:w-auto"
                          onClick={handleCopyLink}
                          disabled={loading || !url.trim()}
                        >
                          Copy share link
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy a shareable URL</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="lg:col-span-2">
                    <Tabs value={mode} onValueChange={handleModeChange}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="monthly">Monthly</TabsTrigger>
                        <TabsTrigger value="last28">Last 28 Days</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </form>
              </CardContent>
            </Card>
          </header>

          <Separator />

          {loading ? (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={`kpi-skeleton-${index}`}>
                    <CardHeader className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-32" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Card>
                  <CardHeader>
                    <Skeleton className="h-4 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <Skeleton className="h-4 w-28" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : data ? (
            <section className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Latest snapshot</h2>
                  <p className="text-sm text-muted-foreground">
                    {data.domain} - {MODE_LABELS[mode]}
                  </p>
                </div>
                {data.meta.partial && (
                  <Badge variant="outline">Partial coverage</Badge>
                )}
              </div>

              {data.meta.partial && data.meta.notes?.length ? (
                <Alert>
                  <AlertTitle>Some data is missing.</AlertTitle>
                  <AlertDescription>
                    {data.meta.notes.join(" ")}
                  </AlertDescription>
                </Alert>
              ) : null}

              {!hasCoverage ? (
                <Alert>
                  <AlertTitle>No coverage found.</AlertTitle>
                  <AlertDescription>
                    Try a larger domain, remove subdomains, or confirm the site
                    receives measurable traffic in Similarweb.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardHeader className="space-y-2">
                        <CardDescription>Visits</CardDescription>
                        <CardTitle className="text-3xl">
                          {formatCompactNumber(data.summary.latestVisits)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="space-y-2">
                        <CardDescription>Bounce Rate</CardDescription>
                        <CardTitle className="text-3xl">
                          {formatPercent(data.summary.latestBounceRate)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="space-y-2">
                        <CardDescription>Pages / Visit</CardDescription>
                        <CardTitle className="text-3xl">
                          {data.summary.latestPagesPerVisit !== undefined
                            ? data.summary.latestPagesPerVisit.toFixed(2)
                            : "N/A"}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="space-y-2">
                        <CardDescription>Avg. Duration</CardDescription>
                        <CardTitle className="text-3xl">
                          {formatDuration(
                            data.summary.latestAvgDurationSeconds
                          )}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList>
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="engagement">Engagement</TabsTrigger>
                      <TabsTrigger value="channels">Channels</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Visits trend</CardTitle>
                          <CardDescription>
                            Total visits across desktop and mobile.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {visitsSeries.length ? (
                            <ChartContainer
                              config={visitsChartConfig}
                              className="h-[260px]"
                            >
                              <AreaChart data={visitsSeries}>
                                <defs>
                                  <linearGradient
                                    id="visitsFill"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      offset="5%"
                                      stopColor="var(--color-visits)"
                                      stopOpacity={0.4}
                                    />
                                    <stop
                                      offset="95%"
                                      stopColor="var(--color-visits)"
                                      stopOpacity={0.05}
                                    />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                  dataKey="date"
                                  tickFormatter={formatDateLabel}
                                  tickMargin={8}
                                />
                                <YAxis
                                  tickFormatter={formatCompactNumber}
                                  width={70}
                                />
                                <ChartTooltip
                                  content={
                                    <ChartTooltipContent
                                      labelFormatter={formatDateLabel}
                                    />
                                  }
                                />
                                <Area
                                  dataKey="visits"
                                  stroke="var(--color-visits)"
                                  fill="url(#visitsFill)"
                                  strokeWidth={2}
                                />
                              </AreaChart>
                            </ChartContainer>
                          ) : (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                              No visits data available.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle>Bounce Rate</CardTitle>
                            <CardDescription>
                              Percentage of single-page visits.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {bounceSeries.length ? (
                              <ChartContainer
                                config={bounceChartConfig}
                                className="h-[220px]"
                              >
                                <LineChart data={bounceSeries}>
                                  <CartesianGrid vertical={false} />
                                  <XAxis
                                    dataKey="date"
                                    tickFormatter={formatDateLabel}
                                    tickMargin={8}
                                  />
                                  <YAxis
                                    tickFormatter={(value) =>
                                      `${value.toFixed(0)}%`
                                    }
                                    width={60}
                                  />
                                  <ChartTooltip
                                    content={
                                      <ChartTooltipContent
                                        labelFormatter={formatDateLabel}
                                        formatter={(value) => (
                                          <div className="flex w-full items-center justify-between gap-3">
                                            <span className="text-muted-foreground">
                                              Bounce Rate
                                            </span>
                                            <span className="text-foreground font-mono font-medium">
                                              {formatPercent(Number(value))}
                                            </span>
                                          </div>
                                        )}
                                      />
                                    }
                                  />
                                  <Line
                                    dataKey="bounce"
                                    stroke="var(--color-bounce)"
                                    strokeWidth={2}
                                    dot={false}
                                  />
                                </LineChart>
                              </ChartContainer>
                            ) : (
                              <div className="py-10 text-center text-sm text-muted-foreground">
                                No bounce rate data available.
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle>Pages per Visit</CardTitle>
                            <CardDescription>
                              Average pages viewed per session.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {pagesSeries.length ? (
                              <ChartContainer
                                config={pagesChartConfig}
                                className="h-[220px]"
                              >
                                <LineChart data={pagesSeries}>
                                  <CartesianGrid vertical={false} />
                                  <XAxis
                                    dataKey="date"
                                    tickFormatter={formatDateLabel}
                                    tickMargin={8}
                                  />
                                  <YAxis width={60} />
                                  <ChartTooltip
                                    content={
                                      <ChartTooltipContent
                                        labelFormatter={formatDateLabel}
                                      />
                                    }
                                  />
                                  <Line
                                    dataKey="pages"
                                    stroke="var(--color-pages)"
                                    strokeWidth={2}
                                    dot={false}
                                  />
                                </LineChart>
                              </ChartContainer>
                            ) : (
                              <div className="py-10 text-center text-sm text-muted-foreground">
                                No pages-per-visit data available.
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="engagement" className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Bounce Rate trend</CardTitle>
                          <CardDescription>
                            Compare engagement over time.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {bounceSeries.length ? (
                            <ChartContainer
                              config={bounceChartConfig}
                              className="h-[260px]"
                            >
                              <LineChart data={bounceSeries}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                  dataKey="date"
                                  tickFormatter={formatDateLabel}
                                  tickMargin={8}
                                />
                                <YAxis
                                  tickFormatter={(value) =>
                                    `${value.toFixed(0)}%`
                                  }
                                  width={60}
                                />
                                <ChartTooltip
                                  content={
                                    <ChartTooltipContent
                                      labelFormatter={formatDateLabel}
                                        formatter={(value) => (
                                        <div className="flex w-full items-center justify-between gap-3">
                                          <span className="text-muted-foreground">
                                            Bounce Rate
                                          </span>
                                          <span className="text-foreground font-mono font-medium">
                                            {formatPercent(Number(value))}
                                          </span>
                                        </div>
                                      )}
                                    />
                                  }
                                />
                                <Line
                                  dataKey="bounce"
                                  stroke="var(--color-bounce)"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ChartContainer>
                          ) : (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                              No bounce rate data available.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Average visit duration</CardTitle>
                          <CardDescription>
                            Session duration in minutes and seconds.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {durationSeries.length ? (
                            <ChartContainer
                              config={durationChartConfig}
                              className="h-[260px]"
                            >
                              <LineChart data={durationSeries}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                  dataKey="date"
                                  tickFormatter={formatDateLabel}
                                  tickMargin={8}
                                />
                                <YAxis
                                  tickFormatter={(value) =>
                                    formatDuration(Number(value))
                                  }
                                  width={70}
                                />
                                <ChartTooltip
                                  content={
                                    <ChartTooltipContent
                                      labelFormatter={formatDateLabel}
                                      formatter={(value) => (
                                        <div className="flex w-full items-center justify-between gap-3">
                                          <span className="text-muted-foreground">
                                            Avg. Duration
                                          </span>
                                          <span className="text-foreground font-mono font-medium">
                                            {formatDuration(Number(value))}
                                          </span>
                                        </div>
                                      )}
                                    />
                                  }
                                />
                                <Line
                                  dataKey="duration"
                                  stroke="var(--color-duration)"
                                  strokeWidth={2}
                                  dot={false}
                                />
                              </LineChart>
                            </ChartContainer>
                          ) : (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                              No duration data available.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="channels" className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                        <Card>
                          <CardHeader>
                            <CardTitle>Channel mix</CardTitle>
                            <CardDescription>
                              Share of desktop visits by channel.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {channelSeries.length ? (
                              <ChartContainer
                                config={channelsChartConfig}
                                className="h-[280px]"
                              >
                                <PieChart>
                                  <ChartTooltip
                                    content={
                                      <ChartTooltipContent
                                        formatter={(value, name) => (
                                          <div className="flex w-full items-center justify-between gap-4">
                                            <span className="text-muted-foreground">
                                              {name}
                                            </span>
                                            <span className="text-foreground font-mono font-medium">
                                              {formatPercent(Number(value))}
                                            </span>
                                          </div>
                                        )}
                                      />
                                    }
                                  />
                                  <Pie
                                    data={channelSeries}
                                    dataKey="share"
                                    nameKey="channel"
                                    innerRadius={60}
                                    outerRadius={110}
                                    paddingAngle={2}
                                  >
                                    {channelSeries.map((entry, index) => (
                                      <Cell
                                        key={`cell-${entry.channel}`}
                                        fill={
                                          chartPalette[index % chartPalette.length]
                                        }
                                      />
                                    ))}
                                  </Pie>
                                </PieChart>
                              </ChartContainer>
                            ) : (
                              <div className="py-12 text-center text-sm text-muted-foreground">
                                No channel data available.
                              </div>
                            )}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle>Channel breakdown</CardTitle>
                            <CardDescription>
                              Percentage of traffic by source.
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {channelSeries.length ? (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Channel</TableHead>
                                    <TableHead className="text-right">
                                      Share
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {channelSeries.map((channel) => (
                                    <TableRow key={channel.channel}>
                                      <TableCell>{channel.channel}</TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatPercent(channel.share)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <div className="py-12 text-center text-sm text-muted-foreground">
                                No channel data available.
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </section>
          ) : hasSearched ? (
            <Alert>
              <AlertTitle>No results yet.</AlertTitle>
              <AlertDescription>
                Enter a domain to see Similarweb estimates for visits, engagement,
                and channels.
              </AlertDescription>
            </Alert>
          ) : (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>Ready when you are.</CardTitle>
                <CardDescription>
                  Paste a URL to generate an instant traffic pulse report.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
