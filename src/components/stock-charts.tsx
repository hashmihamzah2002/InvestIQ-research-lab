"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtCurrency, fmtPct } from "@/lib/format";

export function PriceChart({
  series,
}: {
  series: { date: string; close: number }[];
}) {
  const config = {
    close: { label: "Close", color: "var(--chart-1)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <AreaChart data={series} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={48}
          tickFormatter={(v: string) => v.slice(0, 7)}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => v.toFixed(0)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="close"
          type="monotone"
          fill="var(--color-close)"
          fillOpacity={0.15}
          stroke="var(--color-close)"
          strokeWidth={1.6}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function RevenueEarningsChart({
  data,
}: {
  data: { year: number; revenue: number | null; netIncome: number | null }[];
}) {
  const config = {
    revenue: { label: "Revenue", color: "var(--chart-1)" },
    netIncome: { label: "Net income", color: "var(--chart-2)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-48 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v: number) => fmtCurrency(v)}
          tickLine={false}
          axisLine={false}
          width={64}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {item?.payload ? String(name) : String(name)}
                  </span>
                  <span className="font-mono">{fmtCurrency(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={3} />
        <Bar dataKey="netIncome" fill="var(--color-netIncome)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

export function MarginTrendChart({
  data,
}: {
  data: { year: number; grossMargin: number | null; operatingMargin: number | null }[];
}) {
  const config = {
    grossMargin: { label: "Gross margin", color: "var(--chart-3)" },
    operatingMargin: { label: "Operating margin", color: "var(--chart-4)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-48 w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v: number) => fmtPct(v, 0)}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{String(name)}</span>
                  <span className="font-mono">{fmtPct(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Line dataKey="grossMargin" stroke="var(--color-grossMargin)" strokeWidth={1.6} dot={false} />
        <Line dataKey="operatingMargin" stroke="var(--color-operatingMargin)" strokeWidth={1.6} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}

export function FcfChart({
  data,
}: {
  data: { year: number; fcf: number | null }[];
}) {
  const config = {
    fcf: { label: "Free cash flow", color: "var(--chart-5)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="h-48 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v: number) => fmtCurrency(v)}
          tickLine={false}
          axisLine={false}
          width={64}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="font-mono">{fmtCurrency(Number(value))}</span>
              )}
            />
          }
        />
        <Bar dataKey="fcf" fill="var(--color-fcf)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}
