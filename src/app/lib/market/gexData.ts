"use server";

import { getMarketDataProvider } from "./provider";
import { computeGEX, type GEXResult, type StrikeExposure } from "./gex";
import type { FuturesQuote } from "./types";

export type GEXView = "ES" | "NQ" | "Gold" | "Silver";

export type GEXPagePayload = {
  view: GEXView;
  /** Futures/spot quote for the selected view */
  futuresQuote: FuturesQuote | null;
  /** Full GEX result (null for Gold/Silver in this version) */
  gex: GEXResult | null;
  /** When true, this view does not have options GEX yet (e.g. Gold, Silver) */
  gexNotAvailable: boolean;
  /** Error message if fetch or compute failed */
  error: string | null;
};

const RISK_FREE_RATE =
  Number(process.env.RISK_FREE_RATE) || 0.04;

async function fetchES(): Promise<GEXPagePayload> {
  const provider = getMarketDataProvider();
  const [futuresQuote, chain] = await Promise.all([
    provider.getFuturesQuote("ES=F"),
    provider.getOptionChain("SPY"),
  ]);

  if (!chain) {
    return {
      view: "ES",
      futuresQuote,
      gex: null,
      gexNotAvailable: false,
      error: "Could not load SPY option chain.",
    };
  }

  const gex = computeGEX(chain, { riskFreeRate: RISK_FREE_RATE });
  return {
    view: "ES",
    futuresQuote,
    gex,
    gexNotAvailable: false,
    error: null,
  };
}

async function fetchNQ(): Promise<GEXPagePayload> {
  const provider = getMarketDataProvider();
  const [futuresQuote, chain] = await Promise.all([
    provider.getFuturesQuote("NQ=F"),
    provider.getOptionChain("QQQ"),
  ]);

  if (!chain) {
    return {
      view: "NQ",
      futuresQuote,
      gex: null,
      gexNotAvailable: false,
      error: "Could not load QQQ option chain.",
    };
  }

  const gex = computeGEX(chain, { riskFreeRate: RISK_FREE_RATE });
  return {
    view: "NQ",
    futuresQuote,
    gex,
    gexNotAvailable: false,
    error: null,
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
 * All fetching and GEX calculation is server-side.
 */
export async function getGEXPageData(view: GEXView): Promise<GEXPagePayload> {
  try {
    switch (view) {
      case "ES":
        return await fetchES();
      case "NQ":
        return await fetchNQ();
      case "Gold":
        return await fetchGold();
      case "Silver":
        return await fetchSilver();
      default:
        return await fetchES();
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
