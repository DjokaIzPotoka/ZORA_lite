"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

type StatCardsProps = {
  totalBalance: number;
  totalPnl: number;
  winRatePct: number;
  totalTrades: number;
  totalFees?: number;
  avgWin?: number | null;
  avgLoss?: number | null;
  /** When set, Total Balance can be edited (adjusts stored starting balance). */
  onTotalBalanceCommit?: (newTotal: number) => void;
};

function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function TotalBalanceCard({
  totalBalance,
  onCommit,
}: {
  totalBalance: number;
  onCommit?: (newTotal: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const skipBlurCommitRef = React.useRef(false);

  React.useEffect(() => {
    if (!editing) {
      setDraft((Math.round(totalBalance * 100) / 100).toFixed(2));
    }
  }, [totalBalance, editing]);

  const finish = React.useCallback(() => {
    if (!onCommit) {
      setEditing(false);
      return;
    }
    const n = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setEditing(false);
      return;
    }
    onCommit(Math.round(n * 100) / 100);
    setEditing(false);
  }, [draft, onCommit]);

  const handleBlur = React.useCallback(() => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    finish();
  }, [finish]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-4 shadow-lg">
      <p className="text-xs font-medium uppercase tracking-wider text-white/60">Total Balance</p>
      {editing ? (
        <input
          autoFocus
          type="number"
          step="0.01"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              skipBlurCommitRef.current = true;
              finish();
            }
            if (e.key === "Escape") {
              skipBlurCommitRef.current = true;
              setEditing(false);
            }
          }}
          className="mt-1 w-full min-w-0 rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xl font-semibold text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xl font-semibold text-white tabular-nums">{formatMoney(totalBalance)}</p>
          {onCommit != null && (
            <button
              type="button"
              aria-label="Edit total balance"
              title="Edit total balance"
              onClick={() => {
                setDraft((Math.round(totalBalance * 100) / 100).toFixed(2));
                setEditing(true);
              }}
              className="rounded-md p-1 text-white/40 hover:bg-white/10 hover:text-white/80"
            >
              <Pencil className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StatCards({
  totalBalance,
  totalPnl,
  winRatePct,
  totalTrades,
  totalFees = 0,
  avgWin = null,
  avgLoss = null,
  onTotalBalanceCommit,
}: StatCardsProps) {
  const cards: { label: string; value: string; sub?: string; positive?: boolean }[] = [
    {
      label: "Total P&L",
      value: formatMoney(totalPnl),
      sub: totalPnl >= 0 ? "+0.00% vs cost" : "",
      positive: totalPnl >= 0,
    },
    { label: "Win Rate", value: `${winRatePct.toFixed(1)}%` },
    { label: "Total Trades", value: String(totalTrades) },
    { label: "Total Fees", value: formatMoney(totalFees) },
    {
      label: "Avg Win",
      value: avgWin != null ? formatMoney(avgWin) : "$0.00",
      positive: true,
    },
    {
      label: "Avg Loss",
      value: avgLoss != null ? formatMoney(avgLoss) : "$0.00",
      positive: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
      <TotalBalanceCard totalBalance={totalBalance} onCommit={onTotalBalanceCommit} />
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-white/10 bg-[#121826] p-4 shadow-lg"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-white/60">
            {card.label}
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${
              card.positive === true ? "text-emerald-400" : ""
            } ${card.positive === false ? "text-red-400" : ""} ${
              card.positive === undefined ? "text-white" : ""
            }`}
          >
            {card.value}
          </p>
          {card.sub != null && card.sub !== "" && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-400">
              <span aria-hidden>↑</span> {card.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
