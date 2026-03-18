"use client";

import * as React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

const cardClass = "rounded-xl border border-white/10 bg-[#121826] p-5 shadow-lg";

type WinLossData = { name: string; value: number; count: number };
type MarketData = { name: string; value: number; pct: number };

type DistributionChartsProps = {
  winCount: number;
  lossCount: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  marketCounts: { crypto: number; cfd: number; forex: number; stocks: number };
};

const WIN_COLOR = "#34d399";
const LOSS_COLOR = "#f87171";
const MARKET_COLORS = ["#fb923c", "#60a5fa", "#a78bfa", "#22c55e"];
const TOOLTIP_STYLE = {
  backgroundColor: "#121826",
  borderColor: "rgba(255,255,255,0.1)",
  borderWidth: 1,
  textStyle: { color: "rgba(255,255,255,0.9)" },
};

export function DistributionCharts({
  winCount,
  lossCount,
  avgWin,
  avgLoss,
  largestWin,
  largestLoss,
  marketCounts,
}: DistributionChartsProps) {
  const totalTrades = winCount + lossCount;
  const winRatePct = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  const winLossData: WinLossData[] = React.useMemo(
    () => {
      const arr = [
        { name: "Wins", value: winRatePct, count: winCount },
        { name: "Losses", value: 100 - winRatePct, count: lossCount },
      ].filter((d) => d.count > 0);
      if (arr.length === 0) arr.push({ name: "No trades", value: 100, count: 0 });
      return arr;
    },
    [winRatePct, winCount, lossCount]
  );

  const avgBarData = React.useMemo(
    () => [
      { name: "Average Win", value: Math.max(0, avgWin), fill: WIN_COLOR },
      { name: "Average Loss", value: Math.abs(Math.min(0, avgLoss)), fill: LOSS_COLOR },
    ],
    [avgWin, avgLoss]
  );

  const totalMarket = marketCounts.crypto + marketCounts.cfd + marketCounts.forex + marketCounts.stocks;
  const marketData: MarketData[] = React.useMemo(
    () => {
      const arr = [
        { name: "Crypto", value: marketCounts.crypto, pct: totalMarket > 0 ? (marketCounts.crypto / totalMarket) * 100 : 0 },
        { name: "CFD", value: marketCounts.cfd, pct: totalMarket > 0 ? (marketCounts.cfd / totalMarket) * 100 : 0 },
        { name: "Forex", value: marketCounts.forex, pct: totalMarket > 0 ? (marketCounts.forex / totalMarket) * 100 : 0 },
        { name: "Stocks", value: marketCounts.stocks, pct: totalMarket > 0 ? (marketCounts.stocks / totalMarket) * 100 : 0 },
      ].filter((d) => d.value > 0);
      if (arr.length === 0) arr.push({ name: "No data", value: 1, pct: 100 });
      return arr;
    },
    [marketCounts, totalMarket]
  );

  const winLossOption = React.useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        ...TOOLTIP_STYLE,
        formatter: (params: unknown) => {
          const p = params as { data?: WinLossData };
          const d = p.data;
          if (!d) return "";
          return `${d.name}: ${Number(d.value).toFixed(1)}% (${d.count})`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["55%", "75%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderColor: "#121826",
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: (p: { value?: unknown }) => (Number(p?.value ?? 0) > 0 ? `${Number(p.value).toFixed(1)}%` : ""),
            color: "rgba(255,255,255,0.8)",
          },
          labelLine: { show: false },
          data: winLossData.map((d) => ({
            name: d.name,
            value: d.value,
            count: d.count,
            itemStyle: {
              color: d.name === "Wins" ? WIN_COLOR : d.name === "Losses" ? LOSS_COLOR : "#6b7280",
            },
          })),
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          top: "middle",
          style: {
            text: `${winRatePct.toFixed(1)}% Win Rate`,
            textAlign: "center",
            fill: "white",
            fontSize: 14,
            fontWeight: 500,
          },
          z: 10,
        },
      ],
    } as EChartsOption),
    [winLossData, winRatePct]
  );

  const avgBarOption: EChartsOption = React.useMemo(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 0, right: 24, top: 16, bottom: 16, containLabel: false },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
        axisLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, formatter: (v: number) => `$${v}` },
      },
      yAxis: {
        type: "category",
        data: avgBarData.map((d) => d.name),
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.4)" } },
        axisTick: { show: false },
        axisLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
      },
      tooltip: {
        trigger: "axis",
        ...TOOLTIP_STYLE,
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [];
          const p = arr[0];
          if (!p || p.dataIndex == null) return "";
          const d = avgBarData[p.dataIndex];
          return `<div>${d.name}: $${Number(d.value).toFixed(2)}</div>`;
        },
      },
      series: [
        {
          type: "bar",
          data: avgBarData.map((d) => ({ value: d.value, itemStyle: { color: d.fill, borderRadius: [0, 4, 4, 0] } })),
          barWidth: "60%",
        },
      ],
    }),
    [avgBarData]
  );

  const marketOption = React.useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        ...TOOLTIP_STYLE,
        formatter: (params: unknown) => {
          const p = params as { data?: MarketData };
          const d = p.data;
          if (!d) return "";
          return `${d.name}: ${d.pct.toFixed(1)}%`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["50%", "75%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: "#121826",
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: (p: { data?: MarketData }) =>
              p.data?.pct ? `${p.data.name} (${p.data.pct.toFixed(0)}%)` : "",
            color: "rgba(255,255,255,0.8)",
          },
          data: marketData.map((d, i) => ({
            ...d,
            itemStyle: { color: MARKET_COLORS[i % MARKET_COLORS.length] },
          })),
        },
      ],
    } as EChartsOption),
    [marketData]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Win/Loss Distribution */}
      <div className={cardClass}>
        <h3 className="mb-4 text-lg font-semibold text-white">Win/Loss Distribution</h3>
        <div className="h-[220px]">
          <ReactECharts option={winLossOption} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        </div>
        <div className="mt-2 flex justify-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-white/80">
            <span className="h-2 w-2 rounded-full bg-green-400" /> Wins ({winCount})
          </span>
          <span className="flex items-center gap-1.5 text-white/80">
            <span className="h-2 w-2 rounded-full bg-red-400" /> Losses ({lossCount})
          </span>
        </div>
      </div>

      {/* Average Win vs Loss */}
      <div className={cardClass}>
        <h3 className="mb-4 text-lg font-semibold text-white">Average Win vs Loss</h3>
        <div className="h-[180px]">
          <ReactECharts option={avgBarOption} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        </div>
        <div className="mt-3 flex justify-between border-t border-white/10 pt-3 text-sm">
          <span className="text-white/70">
            Largest Win <span className="text-green-400">+${largestWin.toFixed(2)}</span>
          </span>
          <span className="text-white/70">
            Largest Loss <span className="text-red-400">${largestLoss.toFixed(2)}</span>
          </span>
        </div>
      </div>

      {/* Market Distribution */}
      <div className={cardClass}>
        <h3 className="mb-4 text-lg font-semibold text-white">Market Distribution</h3>
        <div className="h-[220px]">
          <ReactECharts option={marketOption} notMerge style={{ height: "100%", width: "100%" }} opts={{ renderer: "canvas" }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-sm">
          {marketData.map((d, i) => (
            <span key={d.name} className="flex items-center gap-1.5 text-white/80">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: MARKET_COLORS[i % MARKET_COLORS.length] }}
              />
              {d.name} ({d.pct.toFixed(0)}%)
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
