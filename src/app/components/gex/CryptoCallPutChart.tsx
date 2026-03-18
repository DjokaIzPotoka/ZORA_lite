"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { StrikeExposure } from "../../lib/market/gex";

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

export type CryptoCallPutChartProps = {
  strikeExposures: StrikeExposure[];
  spotPrice: number;
  /** Zero gamma level (vertical marker) */
  zeroGamma?: number | null;
  /** Put wall strike (vertical marker) */
  putWall?: number | null;
  /** Vol trigger strike (vertical marker); optional if not computed */
  volTrigger?: number | null;
  /** Call wall strike (vertical marker) */
  callWall?: number | null;
  maxStrikes?: number;
  /** When true, section provides title; no internal heading/card wrapper */
  compact?: boolean;
};

const CALL_COLOR = "rgba(34,197,94,0.85)";
const PUT_COLOR = "rgba(239,68,68,0.85)";
const GRID_COLOR = "rgba(255,255,255,0.06)";
const AXIS_LABEL = "rgba(255,255,255,0.5)";
const AXIS_LINE = "rgba(255,255,255,0.2)";

export function CryptoCallPutChart({
  strikeExposures,
  spotPrice,
  zeroGamma = null,
  putWall = null,
  volTrigger = null,
  callWall = null,
  maxStrikes = 60,
  compact = false,
}: CryptoCallPutChartProps) {
  const data = React.useMemo(() => {
    const slice =
      strikeExposures.length <= maxStrikes
        ? strikeExposures
        : strikeExposures.filter((_, i) => {
            const step = Math.ceil(strikeExposures.length / maxStrikes);
            return i % step === 0;
          });
    return slice.map((s) => ({
      strike: s.strike,
      callGEX: s.callExposure,
      putGEX: -s.putExposure,
      netGEX: s.netExposure,
      strikeLabel: formatPrice(s.strike),
    }));
  }, [strikeExposures, maxStrikes]);

  const option: EChartsOption = React.useMemo(() => {
    if (data.length === 0) return {};

    const strikes = data.map((d) => d.strike);
    const step = strikes.length > 1
      ? Math.min(...strikes.slice(1).map((s, i) => s - strikes[i]))
      : 0;
    const barOffset = step > 0 ? step * 0.22 : 50;

    const markLineData: Array<{
      xAxis: number;
      name: string;
      lineStyle: { color: string; type: "dashed"; width: number };
      label: { formatter: string; color: string; fontSize: number };
    }> = [];

    if (zeroGamma != null) {
      markLineData.push({
        xAxis: zeroGamma,
        name: "Zero Gamma",
        lineStyle: { color: "rgba(255,255,255,0.45)", type: "dashed", width: 1 },
        label: { formatter: "Zero Gamma", color: "rgba(255,255,255,0.75)", fontSize: 10 },
      });
    }
    if (putWall != null) {
      markLineData.push({
        xAxis: putWall,
        name: "Put Wall",
        lineStyle: { color: "rgba(239,68,68,0.7)", type: "dashed", width: 1 },
        label: { formatter: "Put Wall", color: "rgba(248,113,113,0.95)", fontSize: 10 },
      });
    }
    if (volTrigger != null) {
      markLineData.push({
        xAxis: volTrigger,
        name: "Vol Trigger",
        lineStyle: { color: "rgba(245,158,11,0.75)", type: "dashed", width: 1 },
        label: { formatter: "Vol Trigger", color: "rgba(251,191,36,0.95)", fontSize: 10 },
      });
    }
    if (callWall != null) {
      markLineData.push({
        xAxis: callWall,
        name: "Call Wall",
        lineStyle: { color: "rgba(34,197,94,0.7)", type: "dashed", width: 1 },
        label: { formatter: "Call Wall", color: "rgba(74,222,128,0.95)", fontSize: 10 },
      });
    }
    if (strikes.length > 0) {
      const xMinForSpot = Math.min(...strikes);
      const xMaxForSpot = Math.max(...strikes);
      if (spotPrice >= xMinForSpot && spotPrice <= xMaxForSpot) {
        markLineData.push({
          xAxis: spotPrice,
          name: "",
          lineStyle: { color: "rgba(255,255,255,0.35)", type: "dashed", width: 1 },
          label: { formatter: "", color: "rgba(255,255,255,0.8)", fontSize: 10 },
        });
      }
    }

    const xMin = Math.min(...strikes);
    const xMax = Math.max(...strikes);
    const xPadding = (xMax - xMin) * 0.02 || 1000;

    return {
      backgroundColor: "transparent",
      grid: {
        left: 52,
        right: 24,
        top: 32,
        bottom: 44,
        containLabel: false,
      },
      xAxis: {
        type: "value",
        min: xMin - xPadding,
        max: xMax + xPadding,
        axisLine: { lineStyle: { color: AXIS_LINE } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: AXIS_LABEL,
          fontSize: 10,
          formatter: (value: number) => formatPrice(value),
          interval: (index: number, value: number) => {
            const range = xMax - xMin;
            const count = strikes.length;
            const step = range / Math.max(1, Math.min(8, Math.floor(count / 3)));
            if (step <= 0) return true;
            const first = Math.ceil(xMin / step) * step;
            const diff = Math.abs(value - first);
            return diff < step * 0.5 || Math.abs(value - xMax) < step * 0.5;
          },
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: GRID_COLOR, type: "dashed" } },
        axisLabel: {
          color: AXIS_LABEL,
          fontSize: 10,
          formatter: (value: number) => formatGEX(Math.abs(value)),
        },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0f172a",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: "rgba(255,255,255,0.9)", fontSize: 12 },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [];
          const p = arr[0];
          if (!p || !p.data) return "";
          const payload = p.data as [number, number, number, number];
          const callVal = payload[1];
          const putVal = payload[2];
          const netVal = payload[3];
          const x0 = (arr[0]?.data as [number, number, number, number] | undefined)?.[0];
          const x1 = (arr[1]?.data as [number, number, number, number] | undefined)?.[0];
          const strike = x0 != null && x1 != null ? (x0 + x1) / 2 : (p.seriesName === "Call GEX" ? payload[0] + barOffset : payload[0] - barOffset);
          const strikeLabel = formatPrice(strike);
          const callStr = formatGEX(callVal);
          const putStr = formatGEX(Math.abs(putVal));
          const netStr = netVal != null ? formatGEX(netVal) : "—";
          return [
            `<div style="font-weight:600;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1);">Strike ${strikeLabel}</div>`,
            `<div style="display:flex;justify-content:space-between;gap:16px;"><span style="color:rgba(255,255,255,0.5);">Call GEX</span><span style="color:rgb(74,222,128);font-family:monospace;">${callStr}</span></div>`,
            `<div style="display:flex;justify-content:space-between;gap:16px;"><span style="color:rgba(255,255,255,0.5);">Put GEX</span><span style="color:rgb(248,113,113);font-family:monospace;">${putStr}</span></div>`,
            `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);"><span style="color:rgba(255,255,255,0.5);">Net GEX</span><span style="color:rgba(255,255,255,0.8);font-family:monospace;">${netStr}</span></div>`,
          ].join("");
        },
      },
      legend: {
        data: ["Call GEX", "Put GEX"],
        bottom: 4,
        left: "center",
        itemGap: 20,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
        icon: "rect",
      },
      series: [
        {
          name: "Call GEX",
          type: "bar",
          data: data.map((d) => [d.strike - barOffset, d.callGEX, d.putGEX, d.netGEX]),
          itemStyle: { color: CALL_COLOR },
          barMaxWidth: 10,
          barMinWidth: 4,
          markLine: markLineData.length
            ? {
                symbol: "none",
                lineStyle: { width: 1 },
                data: markLineData,
                label: { position: "insideStartTop", distance: 2 },
              }
            : undefined,
        },
        {
          name: "Put GEX",
          type: "bar",
          data: data.map((d) => [d.strike + barOffset, d.callGEX, d.putGEX, d.netGEX]),
          itemStyle: { color: PUT_COLOR },
          barMaxWidth: 10,
          barMinWidth: 4,
        },
      ],
    } as EChartsOption;
  }, [data, zeroGamma, putWall, volTrigger, callWall, spotPrice]);

  const chart = (
    <div className="h-[320px] w-full">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-white/50">
          No strike data
        </div>
      ) : (
        <ReactECharts
          option={option}
          notMerge
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      )}
    </div>
  );

  if (compact) return chart;
  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-5">
      <h2 className="mb-1 text-lg font-semibold text-white">
        Call / Put GEX by Strike
      </h2>
      <p className="mb-4 text-sm text-white/50">
        Hover over bars to see detailed values
      </p>
      {chart}
    </div>
  );
}
