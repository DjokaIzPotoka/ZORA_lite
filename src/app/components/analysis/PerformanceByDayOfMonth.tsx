"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

type DayPnl = { day: number; pnl: number; trades: number; winRate: number };

type PerformanceByDayOfMonthProps = {
  data: DayPnl[];
};

const AXIS_LABEL = "rgba(255,255,255,0.6)";
const AXIS_LINE = "rgba(255,255,255,0.4)";
const SPLIT_LINE = { color: "rgba(255,255,255,0.06)" };
const GREEN = "#34d399";
const RED = "#f87171";

export function PerformanceByDayOfMonth({ data }: PerformanceByDayOfMonthProps) {
  const option: EChartsOption = React.useMemo(() => {
    if (data.length === 0) return {};

    return {
      backgroundColor: "transparent",
      grid: { left: 56, right: 24, top: 16, bottom: 32, containLabel: false },
      xAxis: {
        type: "category",
        data: data.map((d) => String(d.day)),
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
          return `<div style="padding:4px 0">Day ${point.day} · ${point.trades} trades · ${point.winRate.toFixed(0)}% win</div><div>P&L: $${Number(point.pnl).toFixed(2)}</div>`;
        },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => ({
            value: d.pnl,
            itemStyle: {
              color: d.pnl >= 0 ? GREEN : RED,
              borderRadius: [4, 4, 0, 0],
            },
          })),
          emphasis: { itemStyle: { opacity: 1 } },
        },
      ],
    };
  }, [data]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-5 shadow-lg">
      <h3 className="mb-4 text-lg font-semibold text-white">Performance by Day of Month</h3>
      <div className="h-[260px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            No trade data yet
          </div>
        ) : (
          <ReactECharts option={option} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        )}
      </div>
      {data.some((d) => d.trades > 0) && (
        <div className="mt-3 flex flex-wrap gap-4 border-t border-white/10 pt-3 text-xs text-white/70">
          {data.filter((d) => d.trades > 0).map((d) => (
            <span key={d.day}>
              Day {d.day} {d.winRate.toFixed(0)}% {d.trades} trades
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
