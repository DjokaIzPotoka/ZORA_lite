"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { BalancePoint } from "@/lib/tradeFilters";

type TotalBalanceChartProps = {
  data: BalancePoint[];
  range: "7D" | "30D" | "90D";
  onRangeChange: (range: "7D" | "30D" | "90D") => void;
  currentBalance: number;
};

const AXIS_LABEL = "rgba(255,255,255,0.6)";
const AXIS_LINE = "rgba(255,255,255,0.4)";
const SPLIT_LINE = { color: "rgba(255,255,255,0.06)" };
const BLUE = "#60a5fa";

export function TotalBalanceChart({
  data,
  range,
  onRangeChange,
  currentBalance,
}: TotalBalanceChartProps) {
  const ranges: ("7D" | "30D" | "90D")[] = ["7D", "30D", "90D"];

  const option: EChartsOption = React.useMemo(() => {
    if (data.length === 0) return {};

    return {
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 16, bottom: 32, containLabel: false },
      xAxis: {
        type: "category",
        data: data.map((d) => d.displayDate),
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
          return `<div style="padding:4px 0">${point.displayDate}</div><div>Balance: $${Number(point.balance).toFixed(2)}</div>`;
        },
      },
      series: [
        {
          type: "line",
          data: data.map((d) => d.balance),
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { color: BLUE, width: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(96, 165, 250, 0.35)" },
                { offset: 1, color: "rgba(96, 165, 250, 0)" },
              ],
            },
          },
        },
      ],
    };
  }, [data]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-5 shadow-lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Total Balance</h2>
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-blue-400">
            ${currentBalance.toFixed(2)}
          </span>
          <div className="flex gap-2">
            {ranges.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === r
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="h-[280px] w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-white/50 text-sm">
            No trade data yet
          </div>
        ) : (
          <ReactECharts option={option} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        )}
      </div>
    </div>
  );
}
