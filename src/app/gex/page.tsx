"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getGEXPageData, type GEXView, type GEXPagePayload } from "../lib/market/gexData";

const VIEWS: GEXView[] = ["ES", "NQ", "Gold", "Silver"];

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatGEX(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

function Card({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-4 shadow-lg">
      <p className="text-xs font-medium uppercase tracking-wider text-white/60">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold ${
          positive === true ? "text-emerald-400" : ""
        } ${positive === false ? "text-red-400" : ""} ${
          positive === undefined ? "text-white" : ""
        }`}
      >
        {value}
      </p>
      {sub != null && sub !== "" && (
        <p className="mt-0.5 text-xs text-white/50">{sub}</p>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-4 shadow-lg">
      <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-7 w-24 animate-pulse rounded bg-white/10" />
    </div>
  );
}

export default function GEXPage() {
  const [view, setView] = React.useState<GEXView>("ES");

  const {
    data: payload,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["gex", view],
    queryFn: () => getGEXPageData(view),
    staleTime: 60 * 1000,
  });

  const gex = payload?.gex ?? null;
  const quote = payload?.futuresQuote ?? null;
  const gexNotAvailable = payload?.gexNotAvailable ?? false;
  const error = payload?.error ?? null;

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-white">GEX</h1>
          <p className="mt-1 text-sm text-white/60">
            Gamma exposure and options-based positioning (ES proxy: SPY, NQ proxy: QQQ).
          </p>
        </header>

        {/* View tabs */}
        <div className="mb-6 flex gap-2">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                view === v
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
            <div className="rounded-xl border border-white/10 bg-[#121826] p-5">
              <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
              <div className="mt-4 h-64 animate-pulse rounded bg-white/5" />
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-300">Failed to load data.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 rounded bg-red-500/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/30"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && payload && (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
                {error}
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="ml-2 underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Underlying / proxy label */}
            <p className="mb-4 text-sm text-white/50">
              {view === "ES" && "ES=F + SPY options"}
              {view === "NQ" && "NQ=F + QQQ options"}
              {view === "Gold" && "GC=F"}
              {view === "Silver" && "SI=F"}
            </p>

            {/* Metric cards */}
            <section className="mb-8">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
                <Card
                  label="Spot / Futures"
                  value={quote ? formatPrice(quote.price) : "—"}
                  sub={
                    quote?.changePercent != null
                      ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`
                      : undefined
                  }
                  positive={
                    quote?.changePercent != null
                      ? quote.changePercent >= 0
                      : undefined
                  }
                />
                {gex && (
                  <>
                    <Card
                      label="Net GEX"
                      value={formatGEX(gex.netGEX)}
                      positive={gex.netGEX >= 0}
                    />
                    <Card
                      label="Gamma regime"
                      value={gex.gammaRegime}
                    />
                    <Card
                      label="Zero gamma"
                      value={
                        gex.zeroGammaLevel != null
                          ? formatPrice(gex.zeroGammaLevel)
                          : "—"
                      }
                    />
                    <Card
                      label="Call wall"
                      value={
                        gex.callWall != null
                          ? formatPrice(gex.callWall)
                          : "—"
                      }
                    />
                    <Card
                      label="Put wall"
                      value={
                        gex.putWall != null
                          ? formatPrice(gex.putWall)
                          : "—"
                      }
                    />
                  </>
                )}
                {gexNotAvailable && (
                  <div className="col-span-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                    Full GEX is not available for this instrument in this version. Price and trend context only.
                  </div>
                )}
              </div>
              {gex && (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Card
                    label="P/C OI ratio"
                    value={
                      gex.putCallOIRatio != null
                        ? gex.putCallOIRatio.toFixed(2)
                        : "—"
                    }
                  />
                  <Card
                    label="Nearest exp."
                    value={gex.nearestExpirationUsed}
                  />
                </div>
              )}
            </section>

            {/* Strike exposure table */}
            {gex && gex.strikeExposures.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-4 text-lg font-semibold text-white">
                  Strike exposure
                </h2>
                <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#121826]">
                  <table className="w-full min-w-[400px] text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/60">
                        <th className="p-3">Strike</th>
                        <th className="p-3 text-right">Call exposure</th>
                        <th className="p-3 text-right">Put exposure</th>
                        <th className="p-3 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gex.strikeExposures.slice(0, 50).map((row) => (
                        <tr
                          key={row.strike}
                          className="border-b border-white/5 hover:bg-white/[0.02]"
                        >
                          <td className="p-3 font-medium text-white">
                            {formatPrice(row.strike)}
                          </td>
                          <td className="p-3 text-right text-emerald-400/90">
                            {formatGEX(row.callExposure)}
                          </td>
                          <td className="p-3 text-right text-red-400/90">
                            {formatGEX(row.putExposure)}
                          </td>
                          <td
                            className={`p-3 text-right ${
                              row.netExposure >= 0
                                ? "text-emerald-400/90"
                                : "text-red-400/90"
                            }`}
                          >
                            {formatGEX(row.netExposure)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {gex.strikeExposures.length > 50 && (
                    <p className="p-3 text-xs text-white/50">
                      Showing first 50 of {gex.strikeExposures.length} strikes.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Market context & key levels */}
            {gex && (
              <section className="mb-8 grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#121826] p-5">
                  <h2 className="mb-2 text-lg font-semibold text-white">
                    Market context summary
                  </h2>
                  <p className="text-sm leading-relaxed text-white/70">
                    {gex.marketSummary}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#121826] p-5">
                  <h2 className="mb-2 text-lg font-semibold text-white">
                    Key levels
                  </h2>
                  <ul className="space-y-1 text-sm text-white/70">
                    {gex.zeroGammaLevel != null && (
                      <li>Zero gamma (approx.): {formatPrice(gex.zeroGammaLevel)}</li>
                    )}
                    {gex.callWall != null && (
                      <li>Call wall: {formatPrice(gex.callWall)}</li>
                    )}
                    {gex.putWall != null && (
                      <li>Put wall: {formatPrice(gex.putWall)}</li>
                    )}
                    {gex.strongestPositiveStrike != null && (
                      <li>Strongest + strike: {formatPrice(gex.strongestPositiveStrike)}</li>
                    )}
                    {gex.strongestNegativeStrike != null && (
                      <li>Strongest − strike: {formatPrice(gex.strongestNegativeStrike)}</li>
                    )}
                  </ul>
                </div>
              </section>
            )}

            {/* Methodology */}
            <section className="rounded-xl border border-white/10 bg-[#121826] p-5">
              <h2 className="mb-2 text-lg font-semibold text-white">
                Methodology
              </h2>
              <p className="text-sm leading-relaxed text-white/60">
                GEX is computed as gamma × open interest × contract size × spot² × sign (calls +1, puts −1).
                ES context uses SPY options; NQ context uses QQQ options. Gamma is from the data provider when available, otherwise approximated via Black-Scholes. Zero gamma level is the strike where cumulative net exposure flips sign. Gold and Silver show futures price context only; full options GEX for these underlyings is not included in this version.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
