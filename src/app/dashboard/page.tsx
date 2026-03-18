"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getTrades, type Trade } from "../lib/trades";
import { getStartingBalanceForFilter } from "../lib/settings";
import {
  filterTradesByMarket,
  computeCumulativePnL,
  computeBalanceSeries,
  computeStatsFromTrades,
  type CumulativePnLPoint,
} from "@/lib/tradeFilters";
import { useMarketFilter } from "@/store/marketFilterStore";
import { StatCards } from "../components/dashboard/StatCards";
import { CumulativePnLChart } from "../components/dashboard/CumulativePnLChart";
import { TotalBalanceChart } from "../components/dashboard/TotalBalanceChart";
import { RecentTrades } from "../components/dashboard/RecentTrades";
import { AIPredictiveReport } from "../components/dashboard/AIPredictiveReport";
import { MarketFilterToggle } from "../components/shared/MarketFilterToggle";

type Range = "7D" | "30D" | "90D";

function applyRangeToPoints(
  points: CumulativePnLPoint[],
  range: Range
): CumulativePnLPoint[] {
  if (points.length === 0) return [];
  const now = Date.now();
  const ms: Record<Range, number> = {
    "7D": 7 * 24 * 60 * 60 * 1000,
    "30D": 30 * 24 * 60 * 60 * 1000,
    "90D": 90 * 24 * 60 * 60 * 1000,
  };
  const cutoff = now - ms[range];
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}

function applyRangeToBalancePoints<T extends { date: string }>(
  points: T[],
  range: Range
): T[] {
  if (points.length === 0) return [];
  const now = Date.now();
  const ms: Record<Range, number> = {
    "7D": 7 * 24 * 60 * 60 * 1000,
    "30D": 30 * 24 * 60 * 60 * 1000,
    "90D": 90 * 24 * 60 * 60 * 1000,
  };
  const cutoff = now - ms[range];
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
}

export default function DashboardPage() {
  const [range, setRange] = React.useState<Range>("90D");
  const { marketFilter } = useMarketFilter();
  const [startingBalance, setStartingBalance] = React.useState(0);

  React.useEffect(() => {
    setStartingBalance(getStartingBalanceForFilter(marketFilter));
  }, [marketFilter]);

  const { data: trades = [], isLoading: tradesLoading } = useQuery({
    queryKey: ["trades", "all"],
    queryFn: () => getTrades({}),
  });

  const filteredTrades = React.useMemo(
    () => filterTradesByMarket(trades, marketFilter),
    [trades, marketFilter]
  );

  const stats = React.useMemo(
    () => computeStatsFromTrades(filteredTrades),
    [filteredTrades]
  );

  const totalPnl = stats.total_pnl;
  const totalBalance = startingBalance + totalPnl;
  const winRatePct = stats.win_rate_pct ?? 0;
  const totalTrades = stats.total_trades;
  const totalFees = stats.total_fees;
  const avgWin = stats.avg_win;
  const avgLoss = stats.avg_loss;

  const cumulativePoints = React.useMemo(
    () => computeCumulativePnL(filteredTrades),
    [filteredTrades]
  );
  const chartData = React.useMemo(
    () => applyRangeToPoints(cumulativePoints, range),
    [cumulativePoints, range]
  );

  const balancePoints = React.useMemo(
    () => computeBalanceSeries(filteredTrades, startingBalance),
    [filteredTrades, startingBalance]
  );
  const balanceChartData = React.useMemo(
    () => applyRangeToBalancePoints(balancePoints, range),
    [balancePoints, range]
  );

  const recentTrades = React.useMemo(() => filteredTrades.slice(0, 5), [filteredTrades]);

  const isLoading = tradesLoading;

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
            <p className="mt-1 text-sm text-white/60">
              Welcome back! Here&apos;s your trading overview.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-3 sm:mt-0">
            <MarketFilterToggle />
            <span className="text-right text-xs text-white/50">
              Last updated: {new Date().toLocaleDateString("en-US")}
            </span>
          </div>
        </header>

        {isLoading ? (
          <div className="py-12 text-center text-white/60">Loading…</div>
        ) : (
          <>
            <section className="mb-8">
              <StatCards
                totalBalance={totalBalance}
                totalPnl={totalPnl}
                winRatePct={winRatePct}
                totalTrades={totalTrades}
                totalFees={totalFees}
                avgWin={avgWin}
                avgLoss={avgLoss}
              />
            </section>

            <section className="mb-8">
              <TotalBalanceChart
                data={balanceChartData}
                range={range}
                onRangeChange={setRange}
                currentBalance={totalBalance}
              />
            </section>

            <section className="mb-8">
              <CumulativePnLChart
                data={chartData}
                range={range}
                onRangeChange={setRange}
              />
            </section>

            <section>
              <RecentTrades trades={recentTrades} />
            </section>

            <section className="mt-8">
              <AIPredictiveReport />
            </section>
          </>
        )}

        <footer className="mt-8 flex gap-4 text-sm text-white/60">
          <Link href="/analysis" className="hover:text-white">
            Analytics
          </Link>
          <Link href="/trades" className="hover:text-white">
            Trade History
          </Link>
          <Link href="/settings" className="hover:text-white">
            Settings
          </Link>
        </footer>
      </div>
    </div>
  );
}
