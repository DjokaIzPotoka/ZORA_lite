/**
 * Modular GEX calculation helpers for the options GEX engine.
 * Used by Tradier-based GEX and designed for future extension:
 * 0DTE weighting, volume/flow weighting, call/put wall, volatility triggers.
 */

import type { OptionContract, OptionChainResult } from "./types";
import { calculateGamma, timeToExpiryYears } from "./blackScholes";
import { computeGEX, type StrikeExposure, type GEXResult, type ComputeGEXOptions } from "./gex";

const DEFAULT_CONTRACT_SIZE = 100;
const DEFAULT_RISK_FREE_RATE = 0.01;

/**
 * Black-Scholes gamma for a single option.
 * Delegates to blackScholes.calculateGamma; returns 0 for invalid inputs.
 */
export function calculateGammaBS(
  spot: number,
  strike: number,
  sigma: number,
  timeToExpiryYears: number,
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE
): number {
  if (spot <= 0 || strike <= 0 || sigma <= 0 || timeToExpiryYears <= 0) return 0;
  return calculateGamma({
    spot,
    strike,
    iv: sigma,
    timeToExpiry: timeToExpiryYears,
    riskFreeRate,
  });
}

/**
 * Signed GEX for one option: gex = gamma * open_interest * contract_size * S².
 * Call => positive, put => negative.
 */
export function calculateOptionGEX(
  gamma: number,
  openInterest: number,
  contractSize: number,
  spot: number,
  isCall: boolean
): number {
  if (!Number.isFinite(gamma) || !Number.isFinite(spot) || spot <= 0) return 0;
  const oi = Math.max(0, openInterest);
  const size = contractSize > 0 ? contractSize : DEFAULT_CONTRACT_SIZE;
  const raw = gamma * oi * size * spot * spot;
  return isCall ? raw : -raw;
}

/** Per-option computed row (for debugging or future weighting). */
export type OptionGEXRow = {
  strike: number;
  type: "call" | "put";
  gamma: number;
  signedGEX: number;
  openInterest: number;
};

/**
 * Aggregate options into GEX by strike: call GEX, put GEX, net GEX per strike.
 */
export function aggregateGEXByStrike(
  options: OptionContract[],
  optionsConfig?: { riskFreeRate?: number }
): StrikeExposure[] {
  const riskFreeRate = optionsConfig?.riskFreeRate ?? DEFAULT_RISK_FREE_RATE;
  const spot = options[0]?.underlyingPrice ?? 0;
  const spotSq = spot * spot;
  const strikeMap = new Map<
    number,
    { callGex: number; putGex: number; callOi: number; putOi: number }
  >();

  for (const c of options) {
    const S = c.underlyingPrice ?? spot;
    if (S <= 0) continue;
    const t = timeToExpiryYears(c.expiration);
    if (t <= 0) continue;
    const iv = c.impliedVolatility ?? 0.2;
    const gamma =
      c.gamma != null && Number.isFinite(c.gamma) && c.gamma > 0
        ? c.gamma
        : calculateGamma({
            spot: S,
            strike: c.strike,
            iv,
            timeToExpiry: t,
            riskFreeRate,
          });
    const size = c.contractSize ?? DEFAULT_CONTRACT_SIZE;
    const raw = gamma * c.openInterest * size * spotSq;
    const signed = c.type === "call" ? raw : -raw;
    const k = c.strike;
    const acc = strikeMap.get(k) ?? {
      callGex: 0,
      putGex: 0,
      callOi: 0,
      putOi: 0,
    };
    if (c.type === "call") {
      acc.callGex += signed;
      acc.callOi += c.openInterest;
    } else {
      acc.putGex += signed;
      acc.putOi += c.openInterest;
    }
    strikeMap.set(k, acc);
  }

  return [...strikeMap.entries()]
    .map(([strike, { callGex, putGex, callOi, putOi }]) => ({
      strike,
      callExposure: callGex,
      putExposure: putGex,
      netExposure: callGex + putGex,
      callOi,
      putOi,
      totalOi: callOi + putOi,
    }))
    .sort((a, b) => a.strike - b.strike);
}

/** Strike row with cumulative net GEX. */
export type StrikeWithCumulative = StrikeExposure & { cumulativeGEX: number };

/**
 * Add cumulative GEX by strike (sorted ascending by strike).
 */
export function calculateCumulativeGEX(
  byStrike: StrikeExposure[]
): StrikeWithCumulative[] {
  const sorted = [...byStrike].sort((a, b) => a.strike - b.strike);
  let running = 0;
  return sorted.map((row) => {
    running += row.netExposure;
    return { ...row, cumulativeGEX: running };
  });
}

/**
 * Estimate zero gamma / gamma flip level where cumulative GEX crosses zero.
 * Interpolates between the previous and current strike when the crossing is between them.
 * Returns null if no crossing.
 */
export function estimateZeroGamma(
  cumulativeByStrike: StrikeWithCumulative[]
): number | null {
  if (cumulativeByStrike.length === 0) return null;
  for (let i = 0; i < cumulativeByStrike.length; i++) {
    const curr = cumulativeByStrike[i];
    const prevCum = i === 0 ? 0 : cumulativeByStrike[i - 1].cumulativeGEX;
    const currCum = curr.cumulativeGEX;
    const prevStrike = i === 0 ? curr.strike : cumulativeByStrike[i - 1].strike;
    if (prevCum <= 0 && currCum > 0) {
      if (currCum === prevCum) return curr.strike;
      const frac = (0 - prevCum) / (currCum - prevCum);
      return prevStrike + frac * (curr.strike - prevStrike);
    }
    if (prevCum >= 0 && currCum < 0) {
      if (currCum === prevCum) return curr.strike;
      const frac = (0 - prevCum) / (currCum - prevCum);
      return prevStrike + frac * (curr.strike - prevStrike);
    }
  }
  return null;
}

/**
 * Compute full GEX result from an option chain (Tradier or any OptionChainResult).
 * Uses existing computeGEX with strike band filter (e.g. 80%–120% of spot).
 */
export function computeGEXFromChain(
  chain: OptionChainResult,
  options?: { riskFreeRate?: number } & Partial<ComputeGEXOptions>
): GEXResult {
  return computeGEX(chain, {
    riskFreeRate: options?.riskFreeRate ?? DEFAULT_RISK_FREE_RATE,
    strikeBandMin: options?.strikeBandMin,
    strikeBandMax: options?.strikeBandMax,
    useDistanceWeight: options?.useDistanceWeight,
    debug: options?.debug,
  });
}

/**
 * Normalize a raw GEX result (in options strike scale) to display scale.
 * Used when options source is e.g. QQQ but display is NDX: scale strikes and re-aggregate.
 * - Buckets raw strikes into display strikes (rounded), sums GEX per display strike.
 * - Recomputes cumulative GEX and zero gamma on display-scale strikes.
 * - Scales all strike-derived levels (zero gamma, walls, strongest +/-) and sets spot to referenceSpot.
 */
export function normalizeGEXResultToDisplayScale(
  raw: GEXResult,
  referenceSpot: number,
  optionsUnderlyingSpot: number
): GEXResult {
  if (optionsUnderlyingSpot <= 0 || !Number.isFinite(referenceSpot)) return raw;
  const scaleFactor = referenceSpot / optionsUnderlyingSpot;

  const bucketMap = new Map<
    number,
    { callExposure: number; putExposure: number; callOi: number; putOi: number }
  >();
  for (const row of raw.strikeExposures) {
    const displayStrike = Math.round(row.strike * scaleFactor);
    const acc = bucketMap.get(displayStrike) ?? {
      callExposure: 0,
      putExposure: 0,
      callOi: 0,
      putOi: 0,
    };
    acc.callExposure += row.callExposure;
    acc.putExposure += row.putExposure;
    acc.callOi += (row.callOi ?? 0);
    acc.putOi += (row.putOi ?? 0);
    bucketMap.set(displayStrike, acc);
  }

  const strikeExposures: StrikeExposure[] = [...bucketMap.entries()]
    .map(([strike, { callExposure, putExposure, callOi, putOi }]) => ({
      strike,
      callExposure,
      putExposure,
      netExposure: callExposure + putExposure,
      callOi,
      putOi,
      totalOi: callOi + putOi,
    }))
    .sort((a, b) => a.strike - b.strike);

  const cumulative = calculateCumulativeGEX(strikeExposures);
  const zeroGammaLevel = estimateZeroGamma(cumulative);

  const callWall = strikeExposures.length > 0
    ? [...strikeExposures].sort((a, b) => b.callExposure - a.callExposure)[0]?.strike ?? null
    : null;
  const putWall = strikeExposures.length > 0
    ? [...strikeExposures].sort((a, b) => a.putExposure - b.putExposure)[0]?.strike ?? null
    : null;
  const strongestPositiveStrike = strikeExposures.length > 0
    ? [...strikeExposures].sort((a, b) => b.netExposure - a.netExposure)[0]?.strike ?? null
    : null;
  const strongestNegativeStrike = strikeExposures.length > 0
    ? [...strikeExposures].sort((a, b) => a.netExposure - b.netExposure)[0]?.strike ?? null
    : null;
  const belowSpot = strikeExposures.filter((s) => s.strike < referenceSpot && s.netExposure < 0);
  const volTrigger = belowSpot.length > 0
    ? belowSpot.reduce((best, s) => (s.strike > best ? s.strike : best), belowSpot[0].strike)
    : null;

  const marketSummary = [
    `Spot: $${referenceSpot.toFixed(2)}`,
    `Net GEX: ${(raw.netGEX / 1e9).toFixed(2)}B`,
    `Regime: ${raw.gammaRegime}`,
    zeroGammaLevel != null ? `Zero gamma ~$${Math.round(zeroGammaLevel).toLocaleString()}` : "No crossing in filtered range",
    callWall != null ? `Call wall $${callWall.toLocaleString()}` : "",
    putWall != null ? `Put wall $${putWall.toLocaleString()}` : "",
    raw.putCallOIRatio != null ? `P/C OI ratio ${raw.putCallOIRatio.toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    spotPrice: referenceSpot,
    totalGEX: raw.totalGEX,
    callGEX: raw.callGEX,
    putGEX: raw.putGEX,
    netGEX: raw.netGEX,
    gammaRegime: raw.gammaRegime,
    zeroGammaLevel,
    callWall,
    putWall,
    strongestPositiveStrike,
    strongestNegativeStrike,
    volTrigger,
    putCallOIRatio: raw.putCallOIRatio,
    nearestExpirationUsed: raw.nearestExpirationUsed,
    strikeExposures,
    marketSummary,
    insufficientOptions: raw.insufficientOptions,
    debug: raw.debug,
  };
}
