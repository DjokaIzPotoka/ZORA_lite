"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { StrikeExposure } from "../../lib/market/gex";
import { calculateCumulativeGEX } from "../../lib/market/gexEngine";

function formatPrice(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatGEX(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

const AXIS_LABEL = "rgba(255,255,255,0.5)";
const AXIS_LINE = "rgba(255,255,255,0.2)";
const GRID_COLOR = "rgba(255,255,255,0.06)";
const NET_GEX_COLOR = "rgba(96,165,250,0.85)";
const CUMULATIVE_COLOR = "rgba(167,139,250,0.9)";

export type GexByStrikeChartProps = {
  strikeExposures: StrikeExposure[];
  spotPrice: number;
  zeroGammaLevel: number | null;
  maxStrikes?: number;
  compact?: boolean;
};

export function GexByStrikeChart({
  strikeExposures,
  spotPrice,
  zeroGammaLevel,
  maxStrikes = 60,
  compact = false,
}: GexByStrikeChartProps) {
  const { barData, cumulativeData, xMin, xMax } = React.useMemo(() => {
    const cumulative = calculateCumulativeGEX(strikeExposures);
    const slice =
      cumulative.length <= maxStrikes
        ? cumulative
        : cumulative.filter((_, i) => {
            const step = Math.ceil(cumulative.length / maxStrikes);
            return i % step === 0;
          });
    const barData = slice.map((s) => [s.strike, s.netExposure] as [number, number]);
    const cumulativeData = slice.map((s) => [s.strike, s.cumulativeGEX] as [number, number]);
    const strikes = slice.map((s) => s.strike);
    const xMin = strikes.length ? Math.min(...strikes) : 0;
    const xMax = strikes.length ? Math.max(...strikes) : 0;
    return { barData, cumulativeData, xMin, xMax };
  }, [strikeExposures, maxStrikes]);

  const option: EChartsOption = React.useMemo(() => {
    if (barData.length === 0) return {};

    const xPadding = (xMax - xMin) * 0.02 || 1;
    const markLineData: Array<{
      xAxis: number;
      name?: string;
      lineStyle: { color: string; type: "dashed"; width: number };
      label?: { show?: boolean; formatter?: string; color?: string; fontSize?: number };
    }> = [];

    if (spotPrice >= xMin - xPadding && spotPrice <= xMax + xPadding) {
      markLineData.push({
        xAxis: spotPrice,
        name: "Spot",
        lineStyle: { color: "rgba(255,255,255,0.45)", type: "dashed", width: 1 },
        label: { show: true, formatter: "Spot", color: "rgba(255,255,255,0.75)", fontSize: 10 },
      });
    }
    if (zeroGammaLevel != null && zeroGammaLevel >= xMin - xPadding && zeroGammaLevel <= xMax + xPadding) {
      markLineData.push({
        xAxis: zeroGammaLevel,
        name: "Zero Γ",
        lineStyle: { color: "rgba(251,191,36,0.8)", type: "dashed", width: 1 },
        label: { show: true, formatter: "Zero Γ", color: "rgba(251,191,36,0.95)", fontSize: 10 },
      });
    }

    return {
      backgroundColor: "transparent",
      grid: { left: 56, right: 56, top: 28, bottom: 36, containLabel: false },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0f172a",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: "rgba(255,255,255,0.9)", fontSize: 12 },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [];
          const p0 = arr[0];
          const p1 = arr[1];
          if (!p0?.data) return "";
          const strike = (p0.data as [number, number])[0];
          const netVal = (p0.data as [number, number])[1];
          const cumVal = p1?.data ? (p1.data as [number, number])[1] : null;
          const parts = [
            `<div style="font-weight:600;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1);">Strike ${formatPrice(strike)}</div>`,
            `<div style="display:flex;justify-content:space-between;gap:16px;"><span style="color:rgba(255,255,255,0.5);">Net GEX</span><span style="color:rgba(147,197,253,0.95);font-family:monospace;">${formatGEX(netVal)}</span></div>`,
          ];
          if (cumVal != null) {
            parts.push(`<div style="display:flex;justify-content:space-between;gap:16px;"><span style="color:rgba(255,255,255,0.5);">Cumulative GEX</span><span style="color:rgba(196,181,253,0.95);font-family:monospace;">${formatGEX(cumVal)}</span></div>`);
          }
          return parts.join("");
        },
      },
      xAxis: {
        type: "value",
        min: xMin - xPadding,
        max: xMax + xPadding,
        axisLine: { lineStyle: { color: AXIS_LINE } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { color: AXIS_LABEL, fontSize: 10, formatter: (v: number) => formatPrice(v) },
      },
      yAxis: [
        {
          type: "value",
          name: "Net GEX",
          nameTextStyle: { color: AXIS_LABEL, fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: GRID_COLOR, type: "dashed" } },
          axisLabel: { color: AXIS_LABEL, fontSize: 10, formatter: (v: number) => formatGEX(Number(v)) },
        },
        {
          type: "value",
          name: "Cumulative",
          nameTextStyle: { color: AXIS_LABEL, fontSize: 10 },
          position: "right",
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: AXIS_LABEL, fontSize: 10, formatter: (v: number) => formatGEX(Number(v)) },
        },
      ],
      series: [
        {
          name: "Net GEX",
          type: "bar",
          data: barData,
          itemStyle: {
            color: (params: { data: [number, number] }) =>
              params.data[1] >= 0 ? NET_GEX_COLOR : "rgba(239,68,68,0.85)",
          },
          barMaxWidth: 14,
          barMinWidth: 4,
          markLine: markLineData.length ? { symbol: "none", lineStyle: { width: 1 }, data: markLineData } : undefined,
        },
        {
          name: "Cumulative GEX",
          type: "line",
          yAxisIndex: 1,
          data: cumulativeData,
          symbol: "circle",
          symbolSize: 4,
          showSymbol: cumulativeData.length <= 80,
          lineStyle: { color: CUMULATIVE_COLOR, width: 2 },
          itemStyle: { color: CUMULATIVE_COLOR },
        },
      ],
    } as EChartsOption;
  }, [barData, cumulativeData, xMin, xMax, spotPrice, zeroGammaLevel]);

  const chart = (
    <div className="h-[300px] w-full">
      {barData.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-white/50">
          No strike data
        </div>
      ) : (
        <ReactECharts option={option} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
      )}
    </div>
  );

  if (compact) return chart;
  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">GEX by strike & cumulative</h2>
      {chart}
    </div>
  );
}
