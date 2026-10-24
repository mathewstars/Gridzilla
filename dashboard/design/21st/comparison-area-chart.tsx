/*
 * REFERENCE COPY from 21st.dev. NOT wired in (dashboard/tsconfig.json only includes src/, so this file is never built).
 *
 * Block 3: comparison area chart (two lines with the shaded gap, a limit line)
 * Component: "Chart Area" by @uiable, built on the shadcn/ui Chart primitives (ChartContainer etc., included below as
 *            its registry dependency /components/ui/chart.tsx)
 * 21st.dev:  https://21st.dev/@uiable/components/chart-area   (demo id 30819, component id 16981)
 * Install:   npx shadcn@latest add "https://21st.dev/r/uiable/chart-area"   (we do NOT run it)
 * Licence:   the chart.tsx primitives are shadcn/ui (MIT, github.com/shadcn-ui/ui). The uiable demo file has no licence
 *            header; treat it as a reference and re-implement.
 *
 * Why this one: plain Recharts (we already ship recharts ^2.13), two series, gradient fills, a themeable container that
 * exposes series colours as CSS variables (--color-<key>). No heavy dep. The pattern maps cleanly onto our
 * "without Gridzilla" vs "with Gridzilla" curve.
 *
 * Deps we lack: none for the chart itself (recharts is installed). `cn` from "@/lib/utils" -> plain class join.
 *               The shadcn container relies on shadcn theme classes (fill-muted-foreground, stroke-border, bg-background):
 *               map them to our @theme tokens or drop them.
 *
 * Adapt (it is a STACKED two-series chart; we need a GAP chart):
 *  - Remove stackId="a". Data rows become { t, without: baseline_kw, with: total_kw, gap: [total_kw, baseline_kw] }.
 *    Draw the gap as ONE <Area dataKey="gap"> (Recharts range area: dataKey returning [low, high]) filled P.green at
 *    ~0.18 opacity, then <Line dataKey="without"> grey dashed (P.tertiary, strokeDasharray "6 6") and
 *    <Line dataKey="with"> ink (P.ink, 3px). This is exactly what kit/LiveCurve.tsx draws by hand.
 *  - Limit: <ReferenceLine y={limit_kw} stroke={P.red} strokeWidth={1.5} label="Limit" /> (and -reverse_limit_kw when
 *    solar flows back). "Now": <ReferenceLine x={now} stroke={P.fill} />. Signal window: <ReferenceArea x1 x2> in
 *    P.blue at 0.06 so the time-limited DSO window is visible on the curve itself.
 *  - Colours via chartConfig: { without: { color: P.tertiary }, with: { color: P.ink }, gap: { color: P.green } }.
 *    Never var(--chart-1/2): we have no shadcn chart palette.
 *  - type="natural" -> "monotone" (natural overshoots and can dip under the real value; dataviz rule: no invented
 *    bumps). isAnimationActive={false} for live data; the pan comes from new rows, not from Recharts' intro tween.
 *  - Tooltip: off on the projector stage (no hover at 5 m). Axis ticks P.tertiary, 0.8rem, tabular-nums.
 *  - Decision to make when wiring: LiveCurve.tsx already solves label collisions (layout.ts) that Recharts cannot.
 *    Use this file as the reference for the gradient/gap styling and keep LiveCurve as the engine unless Recharts
 *    passes the G3 overlap detector at 1240x635 and 390x667.
 *  - QA: data-src="/api/history" + data-val on the headline gap number above the chart, not inside the SVG.
 */

// ================================================================ chart-area.tsx (uiable, verbatim) ================
// shadcn
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// third-party
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartData = [
  { month: "January", inbound: 1420, outbound: 840 },
  { month: "February", inbound: 1850, outbound: 1120 },
  { month: "March", inbound: 2100, outbound: 1380 },
  { month: "April", inbound: 1680, outbound: 1540 },
  { month: "May", inbound: 2350, outbound: 1720 },
  { month: "June", inbound: 2890, outbound: 2100 },
  { month: "July", inbound: 3420, outbound: 2450 },
];

const chartConfig = {
  inbound: {
    label: "Inbound Traffic",
    color: "var(--chart-1)",
  },
  outbound: {
    label: "Outbound Traffic",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

//  ------------------------------ | CHART - AREA | ------------------------------  //

export function ChartArea() {
  return (
    <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
      <AreaChart
        accessibilityLayer
        data={chartData}
        margin={{ left: 12, right: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => value.slice(0, 3)}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              className="min-w-[10rem] gap-2 [&_div.flex-1]:items-center [&_div.flex-1]:gap-4 [&>div]:gap-2"
            />
          }
        />
        <defs>
          <linearGradient id="fillInbound" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-inbound)"
              stopOpacity={0.8}
            />
            <stop
              offset="95%"
              stopColor="var(--color-inbound)"
              stopOpacity={0.1}
            />
          </linearGradient>
          <linearGradient id="fillOutbound" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-outbound)"
              stopOpacity={0.8}
            />
            <stop
              offset="95%"
              stopColor="var(--color-outbound)"
              stopOpacity={0.1}
            />
          </linearGradient>
        </defs>
        <Area
          dataKey="outbound"
          type="natural"
          fill="url(#fillOutbound)"
          fillOpacity={0.4}
          stroke="var(--color-outbound)"
          strokeWidth={2}
          stackId="a"
        />
        <Area
          dataKey="inbound"
          type="natural"
          fill="url(#fillInbound)"
          fillOpacity={0.4}
          stroke="var(--color-inbound)"
          strokeWidth={2}
          stackId="a"
        />
      </AreaChart>
    </ChartContainer>
  );
}

export default ChartArea;

// ================================================================ components/ui/chart.tsx (shadcn, verbatim) =========
// (registry dependency of the component above; kept in full because ChartContainer/ChartStyle are the reusable part)
/*
"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"]
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "Chart"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([_, config]) => config.theme || config.color,
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
`,
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref,
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item.dataKey || item.name || "value"}`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>
            {labelFormatter(value, payload)}
          </div>
        )
      }

      if (!value) {
        return null
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      config,
      labelKey,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = payload.length === 1 && indicator !== "dot"

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className,
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color || item.payload.fill || item.color

            return (
              <div
                key={item.dataKey}
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center",
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            },
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center",
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label || item.name}
                        </span>
                      </div>
                      {item.value && (
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {item.value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  },
)
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
      hideIcon?: boolean
      nameKey?: string
    }
>(
  (
    { className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
    ref,
  ) => {
    const { config } = useChart()

    if (!payload?.length) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className,
        )}
      >
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={item.value}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground",
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
      </div>
    )
  },
)
ChartLegendContent.displayName = "ChartLegend"

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}
*/
