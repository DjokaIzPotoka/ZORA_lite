"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getGEXPageData, getTradierStatus, type GEXView, type GEXPagePayload } from "../lib/market/gexData";
import { getCryptoGexPageData, type CryptoGexPagePayload } from "../lib/market/crypto-gex";
import type { CryptoAsset } from "../lib/market/types";
import { CryptoSummaryCards } from "../components/gex/CryptoSummaryCards";
import { FuturesContextPanel } from "../components/gex/FuturesContextPanel";
import { KeyLevelsGrid } from "../components/gex/KeyLevelsGrid";
import { LiquidationHeatmapChart } from "../components/gex/LiquidationHeatmapChart";
import { OptionsGexPanel } from "../components/gex/OptionsGexPanel";
import { CryptoGexProfileChart } from "../components/gex/CryptoGexProfileChart";
import { CryptoCallPutChart } from "../components/gex/CryptoCallPutChart";
import { CryptoStrikeTable } from "../components/gex/CryptoStrikeTable";
import { LiquidationClusterTable } from "../components/gex/LiquidationClusterTable";
import { LiquidationZonesCard } from "../components/gex/LiquidationZonesCard";
import { CryptoMarketSummary } from "../components/gex/CryptoMarketSummary";

const VIEWS: GEXView[] = ["SPX", "NDX", "Gold", "Silver"];
type PageMode = "crypto" | "indices";
type GEXTimeframe = "daily" | "weekly";
const CRYPTO_ASSETS: CryptoAsset[] = ["BTC", "ETH"];

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

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121826] p-4 shadow-lg">
      <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-7 w-24 animate-pulse rounded bg-white/10" />
    </div>
  );
}

export default function GEXPage() {
  const [mode, setMode] = React.useState<PageMode>("crypto");
  const [cryptoAsset, setCryptoAsset] = React.useState<CryptoAsset>("BTC");
  const [timeframe, setTimeframe] = React.useState<GEXTimeframe>("daily");
  const [view, setView] = React.useState<GEXView>("SPX");

  const {
    data: payload,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["gex", view],
    queryFn: () => getGEXPageData(view),
    staleTime: 60 * 1000,
    enabled: mode === "indices",
  });

  const {
    data: cryptoPayload,
    isLoading: cryptoLoading,
    isError: cryptoError,
    refetch: cryptoRefetch,
  } = useQuery({
    queryKey: ["gex-crypto", cryptoAsset, timeframe],
    queryFn: () => getCryptoGexPageData(cryptoAsset, { timeframe }),
    staleTime: 60 * 1000,
    enabled: mode === "crypto",
  });

  const { data: tradierStatus } = useQuery({
    queryKey: ["tradier-status"],
    queryFn: () => getTradierStatus(),
    staleTime: 60 * 1000,
    enabled: mode === "indices",
  });

  const gex = payload?.gex ?? null;
  const quote = payload?.futuresQuote ?? null;
  const gexNotAvailable = payload?.gexNotAvailable ?? false;
  const error = payload?.error ?? null;

  const isCrypto = mode === "crypto";
  const cryptoData: CryptoGexPagePayload | null = cryptoPayload ?? null;
  const cryptoLoadingState = isCrypto && cryptoLoading;
  const cryptoErrorState = isCrypto && cryptoError;

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header / controls — terminal-style */}
        <header className="mb-8 border-b border-white/10 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">GEX</h1>
              <p className="mt-1 text-sm text-white/55">
                {isCrypto
                  ? "Crypto derivatives positioning, options gamma, and liquidation pressure"
                  : "Indices GEX: Tradier options, Yahoo spot (SPX / NDX / Gold / Silver)."}
              </p>
              {isCrypto && (
                <p className="mt-0.5 text-xs text-white/40">
                  {timeframe === "daily"
                    ? "Daily: nearest expiry only."
                    : "Weekly: next 7 days aggregated by strike."}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isCrypto && cryptoData && (
                <>
                  <span className="text-xs text-white/45">
                    {new Date(cryptoData.lastUpdated).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => cryptoRefetch()}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </>
              )}
              <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
                <button
                  type="button"
                  onClick={() => setMode("crypto")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === "crypto"
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  Crypto
                </button>
                <button
                  type="button"
                  onClick={() => setMode("indices")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === "indices"
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  Indices
                </button>
              </div>
              {isCrypto && (
                <>
                  <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
                    <button
                      type="button"
                      onClick={() => setTimeframe("daily")}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        timeframe === "daily"
                          ? "bg-white/10 text-white"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeframe("weekly")}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        timeframe === "weekly"
                          ? "bg-white/10 text-white"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      Weekly
                    </button>
                  </div>
                  <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
                    {CRYPTO_ASSETS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setCryptoAsset(a)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          cryptoAsset === a
                            ? "bg-white/10 text-white"
                            : "text-white/50 hover:text-white/80"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {mode === "indices" && (
                <>
                  {tradierStatus !== undefined && (
                    <span className="text-xs text-white/50">
                      Tradier API: {tradierStatus?.configured ? "OK" : "Not set"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
                  >
                    Refresh
                  </button>
                </>
              )}
              {mode === "indices" && (
                <div className="flex gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
                  {VIEWS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        view === v
                          ? "bg-white/10 text-white"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Crypto mode content */}
        {isCrypto && (
          <>
            {cryptoLoadingState && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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

            {cryptoErrorState && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-sm text-red-300">Failed to load crypto data.</p>
                <button
                  type="button"
                  onClick={() => cryptoRefetch()}
                  className="mt-2 rounded bg-red-500/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/30"
                >
                  Retry
                </button>
              </div>
            )}

            {!cryptoLoadingState && !cryptoErrorState && cryptoData && (
              <>
                {cryptoData.errors.length > 0 && (
                  <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
                    {cryptoData.errors.join(" ")}
                    <button
                      type="button"
                      onClick={() => cryptoRefetch()}
                      className="ml-2 underline"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* 1. Hero analytics strip */}
                <CryptoSummaryCards
                  price={cryptoData.futures?.price ?? null}
                  markPrice={cryptoData.futures?.markPrice ?? null}
                  fundingRate={cryptoData.futures?.fundingRate ?? null}
                  openInterest={cryptoData.futures?.openInterest ?? null}
                  oiChange24h={cryptoData.futures?.openInterestChange24h ?? null}
                  netGEX={cryptoData.gex?.netGEX ?? null}
                  gammaRegime={cryptoData.gex?.gammaRegime ?? null}
                  zeroGammaLevel={cryptoData.gex?.zeroGammaLevel ?? null}
                  callWall={cryptoData.gex?.callWall ?? null}
                  putWall={cryptoData.gex?.putWall ?? null}
                  nearestExpirationUsed={cryptoData.gex?.nearestExpirationUsed ?? null}
                />

                {/* 2. Key levels grid */}
                {cryptoData.gex && cryptoData.futures?.markPrice != null && (
                  <KeyLevelsGrid
                    spotPrice={cryptoData.futures.markPrice}
                    zeroGammaLevel={cryptoData.gex.zeroGammaLevel ?? null}
                    callWall={cryptoData.gex.callWall ?? null}
                    putWall={cryptoData.gex.putWall ?? null}
                    strongestPositiveStrike={cryptoData.gex.strongestPositiveStrike ?? null}
                    strongestNegativeStrike={cryptoData.gex.strongestNegativeStrike ?? null}
                  />
                )}

                {/* Futures context — compact */}
                <section className="mb-10">
                  <FuturesContextPanel
                    futures={cryptoData.futures}
                    fallbackMessage="Binance futures data unavailable."
                  />
                </section>

                {/* Liquidation heatmap */}
                {cryptoData.liquidationSummary && cryptoData.futures && (
                  <section className="mb-10">
                    <LiquidationHeatmapChart
                      levels={cryptoData.liquidationSummary.levels}
                      spotPrice={cryptoData.liquidationSummary.currentPrice ?? cryptoData.futures.markPrice}
                      bins={cryptoData.liquidationSummary.bins}
                      strongestDownsideCluster={cryptoData.liquidationSummary.strongestDownsideCluster}
                      strongestUpsideCluster={cryptoData.liquidationSummary.strongestUpsideCluster}
                    />
                  </section>
                )}

                {/* 4. Net GEX chart — full width anchor */}
                {cryptoData.gex && cryptoData.gex.strikeExposures.length > 0 && (
                  <section className="mb-10">
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold text-white">
                        Net GEX by strike
                      </h2>
                      <p className="mt-1 text-sm text-white/50">
                        Gamma exposure profile across strikes. Primary structural view.
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#121826] p-6">
                      <CryptoGexProfileChart
                        strikeExposures={cryptoData.gex.strikeExposures}
                        spotPrice={cryptoData.gex.spotPrice}
                        compact
                      />
                    </div>
                  </section>
                )}

                {/* 5. Call / Put by strike chart */}
                {cryptoData.gex && cryptoData.gex.strikeExposures.length > 0 && (
                  <section className="mb-10">
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold text-white">
                        Call / Put GEX by Strike
                      </h2>
                      <p className="mt-1 text-sm text-white/50">
                        Hover over bars to see detailed values
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#121826] p-6">
                      <CryptoCallPutChart
                        strikeExposures={cryptoData.gex.strikeExposures}
                        spotPrice={cryptoData.gex.spotPrice}
                        zeroGamma={cryptoData.gex.zeroGammaLevel ?? null}
                        putWall={cryptoData.gex.putWall ?? null}
                        callWall={cryptoData.gex.callWall ?? null}
                        volTrigger={cryptoData.gex.volTrigger ?? null}
                        compact
                      />
                    </div>
                  </section>
                )}

                {/* Options GEX panel — supporting */}
                <section className="mb-10">
                  <OptionsGexPanel
                    gex={cryptoData.gex}
                    fallbackMessage="Deribit options data unavailable."
                  />
                </section>

                {/* 6. Tables / aggregates */}
                {cryptoData.gex && cryptoData.gex.strikeExposures.length > 0 && (
                  <section className="mb-10">
                    <div className="mb-4">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
                        Strike aggregates
                      </h2>
                    </div>
                    <CryptoStrikeTable strikeExposures={cryptoData.gex.strikeExposures} />
                  </section>
                )}

                {cryptoData.liquidationSummary && cryptoData.futures && (
                  <section className="mb-10">
                    <LiquidationClusterTable
                      levels={cryptoData.liquidationSummary.levels}
                      spotPrice={cryptoData.futures.markPrice}
                    />
                  </section>
                )}

                <section className="mb-10 grid gap-6 sm:grid-cols-2">
                  {cryptoData.liquidationSummary && cryptoData.futures && (
                    <LiquidationZonesCard
                      summary={cryptoData.liquidationSummary}
                      spotPrice={cryptoData.futures.markPrice}
                    />
                  )}
                  <CryptoMarketSummary
                    summary={cryptoData.gex?.marketSummary ?? "No summary available."}
                    title="Market summary"
                  />
                </section>

                <section className="rounded-xl border border-white/10 bg-[#121826] p-5">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/60">
                    Methodology
                  </h2>
                  <p className="text-sm leading-relaxed text-white/55">
                    Crypto GEX uses Binance USD-M futures (price, mark, funding, OI) and Deribit options (BTC/ETH).
                    Gamma exposure = gamma × open interest × contract size × spot² (calls +, puts −). Gamma from Deribit when available, else Black-Scholes. Liquidation heatmap is estimated from OI and leverage buckets, not exact exchange data.
                  </p>
                </section>
              </>
            )}
          </>
        )}

        {/* Indices mode: loading */}
        {mode === "indices" && isLoading && (
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

        {mode === "indices" && isError && (
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

        {mode === "indices" && !isLoading && !isError && payload && (
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

            {/* Underlying / options source label */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <p className="text-sm text-white/50">
                {view === "SPX" && "ES=F spot + SPX options"}
                {view === "NDX" && payload?.useQQQFallback ? "NQ=F spot + QQQ options (scaled to NDX)" : "NQ=F spot + NDX options"}
                {view === "Gold" && "GC=F"}
                {view === "Silver" && "SI=F"}
              </p>
              {payload?.useQQQFallback && (
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                  Using QQQ fallback (scaled)
                </span>
              )}
            </div>

            {/* Hero analytics strip — Indices */}
            <section className="mb-10">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/60">
                Market snapshot
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-white/10 bg-[#121826] p-4 shadow-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Spot</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-white">
                    {quote ? formatPrice(quote.price) : "—"}
                  </p>
                  {quote?.changePercent != null && (
                    <p className={`mt-1 text-xs ${quote.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%
                    </p>
                  )}
                </div>
                {gex && (
                  <>
                    {gex.insufficientOptions && (
                      <div className="col-span-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                        Insufficient options data. Key levels and strike table are hidden.
                      </div>
                    )}
                    <div className={`rounded-xl border p-4 shadow-lg ${gex.netGEX >= 0 ? "bg-emerald-500/5 border-emerald-500/15" : "bg-red-500/5 border-red-500/15"}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Net GEX</p>
                      <p className={`mt-2 text-2xl font-bold tabular-nums ${gex.netGEX >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatGEX(gex.netGEX)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#121826] p-4 shadow-lg">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Gamma regime</p>
                      <p className="mt-2 text-2xl font-bold text-white">{gex.gammaRegime}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Zero gamma</p>
                      <p className="mt-2 text-2xl font-bold text-white">
                        {gex.zeroGammaLevel != null
                          ? formatPrice(gex.zeroGammaLevel)
                          : gex.insufficientOptions
                            ? "—"
                            : "No crossing in filtered range"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4 shadow-lg">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Call wall</p>
                      <p className="mt-2 text-2xl font-bold text-white">
                        {gex.callWall != null ? formatPrice(gex.callWall) : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4 shadow-lg">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Put wall</p>
                      <p className="mt-2 text-2xl font-bold text-white">
                        {gex.putWall != null ? formatPrice(gex.putWall) : "—"}
                      </p>
                    </div>
                  </>
                )}
                {gexNotAvailable && (
                  <div className="col-span-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                    Full GEX is not available for this instrument in this version. Price and trend context only.
                  </div>
                )}
              </div>
              {gex && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-xs text-white/60">
                    P/C OI {gex.putCallOIRatio != null ? gex.putCallOIRatio.toFixed(2) : "—"}
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1 text-xs text-white/60">
                    Exp. {gex.nearestExpirationUsed}
                  </span>
                </div>
              )}
            </section>

            {/* Key levels grid — Indices (all levels in display scale: SPX ~4-digit, NDX ~5-digit) */}
            {gex && !gex.insufficientOptions && (quote || gex.spotPrice > 0) && (
              <KeyLevelsGrid
                spotPrice={gex.spotPrice > 0 ? gex.spotPrice : quote!.price}
                zeroGammaLevel={gex.zeroGammaLevel ?? null}
                zeroGammaMessage={gex.zeroGammaLevel == null ? "No crossing in filtered range" : undefined}
                callWall={gex.callWall ?? null}
                putWall={gex.putWall ?? null}
                strongestPositiveStrike={gex.strongestPositiveStrike ?? null}
                strongestNegativeStrike={gex.strongestNegativeStrike ?? null}
              />
            )}

            {/* Strike exposure table */}
            {gex && !gex.insufficientOptions && gex.strikeExposures.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/60">
                  Strike aggregates
                </h2>
                <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#121826]">
                  <table className="w-full min-w-[400px] text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/60">
                        <th className="p-4">Strike</th>
                        <th className="p-4 text-right">Call exposure</th>
                        <th className="p-4 text-right">Put exposure</th>
                        <th className="p-4 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...gex.strikeExposures]
                        .sort((a, b) => Math.abs(b.netExposure) - Math.abs(a.netExposure))
                        .slice(0, 10)
                        .map((row) => (
                        <tr
                          key={row.strike}
                          className="border-b border-white/5 hover:bg-white/[0.02]"
                        >
                          <td className="p-4 font-medium tabular-nums text-white">
                            {formatPrice(row.strike)}
                          </td>
                          <td className="p-4 text-right tabular-nums text-emerald-400/90">
                            {formatGEX(row.callExposure)}
                          </td>
                          <td className="p-4 text-right tabular-nums text-red-400/90">
                            {formatGEX(row.putExposure)}
                          </td>
                          <td
                            className={`p-4 text-right tabular-nums ${
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
                  {gex.strikeExposures.length > 10 && (
                    <p className="p-3 text-xs text-white/50">
                      Top 10 by net GEX magnitude (of {gex.strikeExposures.length} strikes).
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Market summary — Indices */}
            {gex && (
              <section className="mb-10">
                <div className="rounded-xl border border-white/10 bg-[#121826] p-5">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/60">
                    Market summary
                  </h2>
                  <p className="text-sm leading-relaxed text-white/70">
                    {gex.marketSummary}
                  </p>
                </div>
                {gex.debug != null && (
                  <details className="mt-3 rounded-xl border border-white/10 bg-[#121826] p-4">
                    <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-white/50">
                      Debug (dev)
                    </summary>
                    <pre className="mt-2 overflow-x-auto text-xs text-white/60">
                      {JSON.stringify(
                        {
                          optionsBeforeFilter: gex.debug.optionsBeforeFilter,
                          optionsAfterFilter: gex.debug.optionsAfterFilter,
                          minStrike: gex.debug.minStrike,
                          maxStrike: gex.debug.maxStrike,
                          zeroGammaCrossingPair: gex.debug.zeroGammaCrossingPair,
                          callWallStrike: gex.debug.callWallStrike,
                          callWallValue: gex.debug.callWallValue,
                          putWallStrike: gex.debug.putWallStrike,
                          putWallValue: gex.debug.putWallValue,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                )}
              </section>
            )}

            {/* Methodology */}
            <section className="rounded-xl border border-white/10 bg-[#121826] p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/60">
                Methodology
              </h2>
              <p className="text-sm leading-relaxed text-white/55">
                GEX from Tradier options; spot from Yahoo (ES=F, NQ=F). Gamma × open interest × contract size × spot² × sign (calls +1, puts −1). SPX/NDX levels in index scale; NDX may use QQQ fallback scaled to NDX. Gold and Silver: Yahoo price only.
              </p>
            </section>
          </>
        )}

      </div>
    </div>
  );
}
