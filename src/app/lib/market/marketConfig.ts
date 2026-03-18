/**
 * Normalized market configuration for index GEX.
 * Ensures spot and options source are consistent and levels are in the correct display scale.
 */

export type IndexMarket = "SPX" | "NDX";

export type MarketConfig = {
  /** Display name (e.g. "SPX", "NDX") */
  displayName: string;
  /** Symbol used for spot/reference price (ES=F, NQ=F, or index cash) */
  spotSymbol: string;
  /** Symbol used to fetch options chain (SPX, NDX, or QQQ for fallback) */
  optionsSymbol: string;
  /** When true, raw option strikes must be scaled to display (index) scale */
  needsScaling: boolean;
  /** If needsScaling: scale factor = referenceSpot / optionsUnderlyingSpot */
  scalingSource?: "QQQ";
  /** Contract size for options (index options typically 100) */
  contractSize: number;
  /** When true, we are using fallback (e.g. QQQ for NDX); display badge */
  isFallback?: boolean;
};

const SPX_CONFIG: MarketConfig = {
  displayName: "SPX",
  spotSymbol: "ES=F",
  optionsSymbol: "SPX",
  needsScaling: false,
  contractSize: 100,
};

const NDX_CONFIG: MarketConfig = {
  displayName: "NDX",
  spotSymbol: "NQ=F",
  optionsSymbol: "NDX",
  needsScaling: false,
  contractSize: 100,
};

/** NDX fallback when NDX options unavailable: use QQQ options and scale to NDX level */
const NDX_QQQ_FALLBACK_CONFIG: MarketConfig = {
  displayName: "NDX",
  spotSymbol: "NQ=F",
  optionsSymbol: "QQQ",
  needsScaling: true,
  scalingSource: "QQQ",
  contractSize: 100,
  isFallback: true,
};

/**
 * Get market configuration for the given index market.
 * Returns primary config (SPX or NDX). For NDX fallback, use getMarketConfigWithFallback.
 */
export function getMarketConfig(market: IndexMarket): MarketConfig {
  return market === "SPX" ? SPX_CONFIG : NDX_CONFIG;
}

/**
 * Get market config, and for NDX optionally the fallback config (QQQ with scaling).
 */
export function getMarketConfigWithFallback(
  market: IndexMarket
): { primary: MarketConfig; fallback?: MarketConfig } {
  if (market === "SPX") {
    return { primary: SPX_CONFIG };
  }
  return {
    primary: NDX_CONFIG,
    fallback: NDX_QQQ_FALLBACK_CONFIG,
  };
}

/**
 * Compute display (index) strike from raw option strike when scaling is required.
 * scaledLevel = rawStrike * (referenceSpot / optionsUnderlyingSpot)
 */
export function normalizeStrikeLevel(
  rawStrike: number,
  referenceSpot: number,
  optionsUnderlyingSpot: number
): number {
  if (optionsUnderlyingSpot <= 0 || !Number.isFinite(rawStrike)) return rawStrike;
  return rawStrike * (referenceSpot / optionsUnderlyingSpot);
}
