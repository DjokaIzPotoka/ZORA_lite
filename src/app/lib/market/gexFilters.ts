/**
 * Strike universe filters for GEX so levels are derived from relevant strikes near spot.
 * Prevents far OTM strikes from distorting Zero Gamma, walls, and strongest strikes.
 */

import type { OptionContract } from "./types";
import { timeToExpiryYears } from "./blackScholes";

export type StrikeFilterConfig = {
  /** Keep strikes >= spot * minPct (default 0.8) */
  minPct?: number;
  /** Keep strikes <= spot * maxPct (default 1.2) */
  maxPct?: number;
};

const DEFAULT_MIN_PCT = 0.8;
const DEFAULT_MAX_PCT = 1.2;

/** Minimum options after filter to consider the universe valid. */
export const MIN_FILTERED_OPTIONS = 10;

/**
 * Filter options to a relevant strike band around spot.
 * Keeps only: strike in [spot*0.8, spot*1.2], open_interest > 0, implied_volatility > 0, time_to_expiry > 0.
 */
export function filterRelevantOptions(
  options: OptionContract[],
  spot: number,
  config?: StrikeFilterConfig
): OptionContract[] {
  if (spot <= 0 || !Array.isArray(options)) return [];
  const minPct = config?.minPct ?? DEFAULT_MIN_PCT;
  const maxPct = config?.maxPct ?? DEFAULT_MAX_PCT;
  const minStrike = spot * minPct;
  const maxStrike = spot * maxPct;

  return options.filter((c) => {
    if (c.strike < minStrike || c.strike > maxStrike) return false;
    if (c.openInterest == null || c.openInterest <= 0) return false;
    const iv = c.impliedVolatility;
    if (iv == null || (typeof iv === "number" && (iv <= 0 || !Number.isFinite(iv)))) return false;
    const t = timeToExpiryYears(c.expiration);
    if (t <= 0 || !Number.isFinite(t)) return false;
    return true;
  });
}

/**
 * Soft distance weight: exp(-|strike - spot| / spot).
 * Use when aggregating so strikes near spot influence more. Optional; apply to GEX contribution only.
 */
export function distanceWeight(strike: number, spot: number): number {
  if (spot <= 0 || !Number.isFinite(strike)) return 1;
  return Math.exp(-Math.abs(strike - spot) / spot);
}
