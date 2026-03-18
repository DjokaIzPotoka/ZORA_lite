"use server";

import { getMarketDataProvider } from "./provider";
import { computeGEX, type GEXResult } from "./gex";
import type { FuturesQuote, OptionChainResult } from "./types";
import {
  fetchTradierChainForSymbol,
  fetchTradierExpirations,
  fetchTradierQuote,
  isTradierConfigured,
} from "./tradier";
import { computeGEXFromChain, normalizeGEXResultToDisplayScale } from "./gexEngine";
import {
  type IndexMarket,
  getMarketConfig,
  getMarketConfigWithFallback,
} from "./marketConfig";

/** Index GEX view: SPX and NDX use index options (or QQQ fallback for NDX). Gold/Silver are futures-only. */
export type GEXView = "SPX" | "NDX" | "Gold" | "Silver";

export type GEXPagePayload = {
  view: GEXView;
  /** Spot/reference quote for the selected view (ES=F for SPX, NQ=F for NDX) */
  futuresQuote: FuturesQuote | null;
  gex: GEXResult | null;
  gexNotAvailable: boolean;
  error: string | null;
  /** When true, NDX is using QQQ options scaled to NDX level; show fallback badge */
  useQQQFallback?: boolean;
  /** Resolved index market for display (SPX or NDX when view is one of them) */
  indexMarket?: IndexMarket;
};

/** Payload for Tradier-based GEX (custom symbol). */
export type TradierGEXPayload = {
  symbol: string;
  expiration: string | null;
  futuresQuote: FuturesQuote | null;
  gex: GEXResult | null;
  gexNotAvailable: boolean;
  error: string | null;
  optionsCount: number;
};

const RISK_FREE_RATE = Number(process.env.RISK_FREE_RATE) || 0.04;
const TRADIER_RISK_FREE_RATE = Number(process.env.RISK_FREE_RATE) || 0.01;

/**
 * Fetch spot/reference price for a market (ES=F, NQ=F, etc.).
 */
async function fetchSpotPrice(spotSymbol: string): Promise<FuturesQuote | null> {
  const provider = getMarketDataProvider();
  return provider.getFuturesQuote(spotSymbol);
}

/** Result when options chain is successfully loaded (chain is non-null). */
type ChainResult = { chain: OptionChainResult; optionsSpot: number };

/**
 * Fetch options chain from Tradier for the given symbol (SPX, NDX, QQQ).
 * When referenceSpot is provided (e.g. from Yahoo ES=F/NQ=F), use it so index symbols that have no Tradier quote still load.
 */
async function fetchOptionsChain(
  optionsSymbol: string,
  expiration: string | null = null,
  referenceSpot?: number
): Promise<ChainResult | null> {
  // #region agent log
  const _dbg = (loc: string, msg: string, d: Record<string, unknown>) => { fetch("http://127.0.0.1:7242/ingest/8a16eeec-6b72-41f4-9614-55f64ad0f10d", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a93b0" }, body: JSON.stringify({ sessionId: "7a93b0", location: loc, message: msg, data: d, timestamp: Date.now() }) }).catch(() => {}); };
  _dbg("gexData.ts:fetchOptionsChain", "calling Tradier", { optionsSymbol, expiration: expiration ?? "nearest", hasRefSpot: referenceSpot != null && referenceSpot > 0 });
  // #endregion
  const chain = await fetchTradierChainForSymbol(
    optionsSymbol,
    expiration,
    referenceSpot && referenceSpot > 0 ? referenceSpot : undefined
  );
  // #region agent log
  if (!chain || chain.options.length === 0) _dbg("gexData.ts:fetchOptionsChain", "chain null or empty", { optionsSymbol, hasChain: !!chain, optionsCount: chain?.options?.length ?? 0 });
  // #endregion
  if (!chain || chain.options.length === 0) return null;
  return { chain, optionsSpot: chain.underlyingPrice };
}

async function fetchSPX(): Promise<GEXPagePayload> {
  const config = getMarketConfig("SPX");
  const futuresQuote = await fetchSpotPrice(config.spotSymbol);
  const chainResult = await fetchOptionsChain(
    config.optionsSymbol,
    null,
    futuresQuote?.price
  );

  if (!chainResult) {
    const tokenMsg = !isTradierConfigured()
      ? " Add TRADIER_ACCESS_TOKEN (or TRADIER_API_KEY) to .env.local and restart the dev server."
      : "";
    return {
      view: "SPX",
      futuresQuote,
      gex: null,
      gexNotAvailable: false,
      error: "Could not load SPX option chain." + tokenMsg,
    };
  }

  const { chain } = chainResult;
  const referenceSpot = futuresQuote?.price ?? chain.underlyingPrice;
  if (referenceSpot <= 0) {
    return {
      view: "SPX",
      futuresQuote,
      gex: null,
      gexNotAvailable: false,
      error: "Could not get reference spot price for SPX.",
    };
  }

  const gex = computeGEXFromChain(chain, {
    riskFreeRate: TRADIER_RISK_FREE_RATE,
    debug: process.env.NODE_ENV === "development",
  });
  const spotPrice = futuresQuote?.price ?? gex.spotPrice;
  const gexWithSpot: GEXResult = {
    ...gex,
    spotPrice,
  };

  return {
    view: "SPX",
    futuresQuote: futuresQuote ?? { symbol: "ES=F", price: spotPrice, currency: "USD" },
    gex: gexWithSpot,
    gexNotAvailable: false,
    error: null,
    indexMarket: "SPX",
  };
}

async function fetchNDX(): Promise<GEXPagePayload> {
  const { primary, fallback } = getMarketConfigWithFallback("NDX");
  const futuresQuote = await fetchSpotPrice(primary.spotSymbol);

  let chainResult = await fetchOptionsChain(
    primary.optionsSymbol,
    null,
    futuresQuote?.price
  );
  if (chainResult) {
    const { chain } = chainResult;
    const referenceSpot = futuresQuote?.price ?? chain.underlyingPrice;
    if (referenceSpot <= 0) {
      return {
        view: "NDX",
        futuresQuote,
        gex: null,
        gexNotAvailable: false,
        error: "Could not get reference spot price for NDX.",
      };
    }
    const gex = computeGEXFromChain(chain, {
      riskFreeRate: TRADIER_RISK_FREE_RATE,
      debug: process.env.NODE_ENV === "development",
    });
    const spotPrice = futuresQuote?.price ?? gex.spotPrice;
    const gexWithSpot: GEXResult = { ...gex, spotPrice };
    return {
      view: "NDX",
      futuresQuote: futuresQuote ?? { symbol: "NQ=F", price: spotPrice, currency: "USD" },
      gex: gexWithSpot,
      gexNotAvailable: false,
      error: null,
      indexMarket: "NDX",
    };
  }

  if (!fallback?.needsScaling || fallback.optionsSymbol !== "QQQ") {
    const tokenMsg = !isTradierConfigured()
      ? " Add TRADIER_ACCESS_TOKEN (or TRADIER_API_KEY) to .env.local and restart the dev server."
      : "";
    return {
      view: "NDX",
      futuresQuote,
      gex: null,
      gexNotAvailable: false,
      error: "Could not load NDX option chain." + tokenMsg,
    };
  }

  const referenceSpot = futuresQuote?.price ?? (await fetchTradierQuote("NQ=F"))?.price ?? 0;
  const qqqResult = await fetchOptionsChain(
    fallback.optionsSymbol,
    null,
    referenceSpot > 0 ? referenceSpot : undefined
  );
  if (!qqqResult) {
    const tokenMsg = !isTradierConfigured()
      ? " Add TRADIER_ACCESS_TOKEN (or TRADIER_API_KEY) to .env.local and restart the dev server."
      : "";
    return {
      view: "NDX",
      futuresQuote,
      gex: null,
      gexNotAvailable: false,
      error: "Could not load NDX or QQQ option chain." + tokenMsg,
    };
  }

  const { chain: qqqChain, optionsSpot: qqqSpot } = qqqResult;
  const refSpot = referenceSpot > 0 ? referenceSpot : qqqSpot;
  if (refSpot <= 0 || qqqSpot <= 0) {
    return {
      view: "NDX",
      futuresQuote,
      gex: null,
      gexNotAvailable: false,
      error: "Could not get reference spot (NQ) and QQQ spot for scaling.",
    };
  }

  const rawGex = computeGEXFromChain(qqqChain, {
    riskFreeRate: TRADIER_RISK_FREE_RATE,
    debug: process.env.NODE_ENV === "development",
  });
  const gex = normalizeGEXResultToDisplayScale(rawGex, refSpot, qqqSpot);

  return {
    view: "NDX",
    futuresQuote: futuresQuote ?? { symbol: "NQ=F", price: refSpot, currency: "USD" },
    gex,
    gexNotAvailable: false,
    error: null,
    useQQQFallback: true,
    indexMarket: "NDX",
  };
}

async function fetchGold(): Promise<GEXPagePayload> {
  const provider = getMarketDataProvider();
  const futuresQuote = await provider.getFuturesQuote("GC=F");
  return {
    view: "Gold",
    futuresQuote,
    gex: null,
    gexNotAvailable: true,
    error: null,
  };
}

async function fetchSilver(): Promise<GEXPagePayload> {
  const provider = getMarketDataProvider();
  const futuresQuote = await provider.getFuturesQuote("SI=F");
  return {
    view: "Silver",
    futuresQuote,
    gex: null,
    gexNotAvailable: true,
    error: null,
  };
}

/**
 * Fetch all data for the GEX page for the given view.
 * SPX: ES=F spot + SPX options (Tradier). NDX: NQ=F spot + NDX options or QQQ fallback scaled.
 */
export async function getGEXPageData(view: GEXView): Promise<GEXPagePayload> {
  try {
    switch (view) {
      case "SPX":
        return await fetchSPX();
      case "NDX":
        return await fetchNDX();
      case "Gold":
        return await fetchGold();
      case "Silver":
        return await fetchSilver();
      default:
        return await fetchSPX();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
      view,
      futuresQuote: null,
      gex: null,
      gexNotAvailable: view === "Gold" || view === "Silver",
      error: message,
    };
  }
}

/**
 * Fetch Tradier options chain for a custom symbol (and optional expiration), compute GEX.
 */
export async function getTradierGEXPageData(
  symbol: string,
  expiration: string | null
): Promise<TradierGEXPayload> {
  try {
    const chain = await fetchTradierChainForSymbol(
      symbol.trim().toUpperCase(),
      expiration
    );
    if (!chain) {
      const quote = await fetchTradierQuote(symbol);
      const tokenMsg = !isTradierConfigured()
        ? " Add TRADIER_ACCESS_TOKEN (or TRADIER_API_KEY) to .env.local and restart the dev server."
        : " Check that the symbol is valid and your Tradier API token has market data access.";
      return {
        symbol: symbol.trim().toUpperCase(),
        expiration,
        futuresQuote: quote,
        gex: null,
        gexNotAvailable: false,
        error: "Could not load options chain." + tokenMsg,
        optionsCount: 0,
      };
    }
    const gex = computeGEXFromChain(chain, {
      riskFreeRate: TRADIER_RISK_FREE_RATE,
      debug: process.env.NODE_ENV === "development",
    });
    const quote =
      chain.underlyingPrice > 0
        ? {
            symbol: chain.symbol,
            price: chain.underlyingPrice,
            currency: "USD" as const,
          }
        : await fetchTradierQuote(symbol);
    return {
      symbol: chain.symbol,
      expiration:
        (chain as { expirationRangeLabel?: string }).expirationRangeLabel ?? expiration,
      futuresQuote:
        quote ?? { symbol: chain.symbol, price: chain.underlyingPrice, currency: "USD" },
      gex,
      gexNotAvailable: false,
      error: null,
      optionsCount: chain.options.length,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
      symbol: symbol.trim().toUpperCase(),
      expiration,
      futuresQuote: null,
      gex: null,
      gexNotAvailable: false,
      error: message,
      optionsCount: 0,
    };
  }
}

export async function getTradierExpirations(symbol: string): Promise<string[]> {
  try {
    return await fetchTradierExpirations(symbol.trim().toUpperCase());
  } catch {
    return [];
  }
}

/** Call this to verify the server sees your Tradier API key (e.g. from .env.local). */
export async function getTradierStatus(): Promise<{ configured: boolean }> {
  return { configured: isTradierConfigured() };
}
