"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

type MonthPnl = { month: string; shortLabel: string; pnl: number };

type MonthlyPerformanceProps = {
  data: MonthPnl[];
  bestMonth: string;
  bestPnl: number;
  worstMonth: string;
  worstPnl: number;
};

const AXIS_LABEL = "rgba(255,255,255,0.6)";
const AXIS_LINE = "rgba(255,255,255,0.4)";
const SPLIT_LINE = { color: "rgba(255,255,255,0.06)" };
const GREEN = "#34d399";

export function MonthlyPerformance({
  data,
  bestMonth,
  bestPnl,
  worstMonth,
  worstPnl,
}: MonthlyPerformanceProps) {
  const option: EChartsOption = React.useMemo(() => {
    if (data.length === 0) return {};

    return {
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 16, bottom: 32, containLabel: false },
      xAxis: {
        type: "category",
        data: data.map((d) => d.shortLabel),
        axisLine: { lineStyle: { color: AXIS_LINE } },
        axisTick: { lineStyle: { color: AXIS_LINE } },
        axisLabel: { color: AXIS_LABEL, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: SPLIT_LINE },
        axisLabel: { color: AXIS_LABEL, fontSize: 11, formatter: (v: number) => `$${v}` },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#121826",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        textStyle: { color: "rgba(255,255,255,0.9)" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [];
          const p = arr[0];
          if (!p || p.dataIndex == null) return "";
          const point = data[p.dataIndex];
          return `<div style="padding:4px 0">${point.month}</div><div>P&L: $${Number(point.pnl).toFixed(2)}</div>`;
        },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => d.pnl),
          itemStyle: {
            color: GREEN,
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: { itemStyle: { color: "#4ade80" } },
        },
      ],
    };
  }, [data]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-5 shadow-lg">
      <h3 className="mb-4 text-lg font-semibold text-white">Monthly Performance</h3>
      <div className="h-[260px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            No trade data yet
          </div>
        ) : (
          <ReactECharts option={option} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        )}
      </div>
      <div className="mt-3 flex justify-between border-t border-white/10 pt-3 text-sm">
        <span className="text-white/70">
          Best Month <span className="text-green-400">{bestMonth} ({bestPnl >= 0 ? "+" : ""}${bestPnl.toFixed(2)})</span>
        </span>
        <span className="text-white/70">
          Worst Month <span className="text-red-400">{worstMonth} ({worstPnl >= 0 ? "+" : ""}${worstPnl.toFixed(2)})</span>
        </span>
      </div>
    </div>
  );
}
