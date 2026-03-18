/**
 * GEX (Gamma Exposure) calculations — institutional-style model.
 *
 * Formula per option:
 *   GEX = gamma × open_interest × contract_size × spot_price²
 *   Call GEX: positive. Put GEX: same magnitude, negative.
 *
 * Strike universe is filtered (e.g. 80%–120% of spot) so Zero Gamma, walls, and strongest
 * strikes are derived from relevant strikes near spot, not distorted by far OTM.
 */

import type { OptionContract, OptionChainResult } from "./types";
import { calculateGamma, timeToExpiryYears } from "./blackScholes";
import {
  filterRelevantOptions,
  MIN_FILTERED_OPTIONS,
  distanceWeight,
} from "./gexFilters";

/** Equity options default; Deribit crypto uses 1 per contract. */
const DEFAULT_CONTRACT_SIZE = 100;

export type ComputeGEXOptions = {
  riskFreeRate?: number;
  /** Strike band: keep strikes in [spot*minPct, spot*maxPct]. Default 0.8, 1.2 */
  strikeBandMin?: number;
  strikeBandMax?: number;
  /** When true, weight GEX contribution by exp(-|strike-spot|/spot) so near strikes count more */
  useDistanceWeight?: boolean;
  /** When true, include debug object in result (dev only) */
  debug?: boolean;
};

export type GEXDebug = {
  optionsBeforeFilter: number;
  optionsAfterFilter: number;
  minStrike: number;
  maxStrike: number;
  zeroGammaCrossingPair: [number, number] | null;
  callWallStrike: number | null;
  callWallValue: number | null;
  putWallStrike: number | null;
  putWallValue: number | null;
};

export type StrikeExposure = {
  strike: number;
  callExposure: number;
  putExposure: number;
  netExposure: number;
  callOi?: number;
  putOi?: number;
  totalOi?: number;
};

export type GammaRegime = "positive" | "negative" | "neutral";

export type GEXResult = {
  spotPrice: number;
  totalGEX: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  gammaRegime: GammaRegime;
  zeroGammaLevel: number | null;
  callWall: number | null;
  putWall: number | null;
  strongestPositiveStrike: number | null;
  strongestNegativeStrike: number | null;
  volTrigger: number | null;
  putCallOIRatio: number | null;
  nearestExpirationUsed: string;
  strikeExposures: StrikeExposure[];
  marketSummary: string;
  /** True when filtered option count was below minimum; levels are not reliable */
  insufficientOptions?: boolean;
  /** Dev-only: filter counts, strike range, wall values */
  debug?: GEXDebug;
};

/**
 * Resolve gamma for one contract: use provider value or compute via Black-Scholes.
 */
function resolveGamma(c: OptionContract, riskFreeRate: number): number {
  if (c.gamma != null && Number.isFinite(c.gamma) && c.gamma > 0) return c.gamma;
  const timeToExpiry = timeToExpiryYears(c.expiration);
  return calculateGamma({
    spot: c.underlyingPrice,
    strike: c.strike,
    iv: c.impliedVolatility ?? 0.2,
    timeToExpiry,
    riskFreeRate,
  });
}

/**
 * Per-option gamma exposure (institutional formula).
 * GEX = gamma × open_interest × contract_size × spot²
 * Calls: positive. Puts: negative.
 */
function contractGammaExposure(
  c: OptionContract,
  gammaVal: number,
  spotSq: number
): number {
  const size = c.contractSize ?? DEFAULT_CONTRACT_SIZE;
  const raw = gammaVal * c.openInterest * size * spotSq;
  return c.type === "call" ? raw : -raw;
}

/**
 * Compute full GEX metrics from an option chain.
 * Filters to relevant strike band (e.g. 80%–120% of spot), then aggregates.
 * Zero gamma from cumulative net GEX crossing; walls and strongest from filtered set only.
 */
export function computeGEX(
  chain: OptionChainResult,
  options?: ComputeGEXOptions
): GEXResult {
  const riskFreeRate = options?.riskFreeRate ?? 0.04;
  const spot = chain.underlyingPrice;
  const spotSq = spot * spot;
  const useDistanceWeight = options?.useDistanceWeight === true;
  const strikeBandMin = options?.strikeBandMin ?? 0.8;
  const strikeBandMax = options?.strikeBandMax ?? 1.2;
  const includeDebug = options?.debug === true;

  const optionsBeforeFilter = chain.options.length;
  const filteredOptions = filterRelevantOptions(chain.options, spot, {
    minPct: strikeBandMin,
    maxPct: strikeBandMax,
  });

  if (filteredOptions.length < MIN_FILTERED_OPTIONS) {
    const chainWithLabel = chain as OptionChainResult & { expirationRangeLabel?: string };
    const nearestExpirationUsed =
      chainWithLabel.expirationRangeLabel != null && chainWithLabel.expirationRangeLabel !== ""
        ? chainWithLabel.expirationRangeLabel
        : new Date(chain.nearestExpiration).toISOString().slice(0, 10);
    return {
      spotPrice: spot,
      totalGEX: 0,
      callGEX: 0,
      putGEX: 0,
      netGEX: 0,
      gammaRegime: "neutral",
      zeroGammaLevel: null,
      callWall: null,
      putWall: null,
      strongestPositiveStrike: null,
      strongestNegativeStrike: null,
      volTrigger: null,
      putCallOIRatio: null,
      nearestExpirationUsed,
      strikeExposures: [],
      marketSummary: `Insufficient options data (${filteredOptions.length} after filter, need ${MIN_FILTERED_OPTIONS}+).`,
      insufficientOptions: true,
      debug: includeDebug
        ? {
            optionsBeforeFilter,
            optionsAfterFilter: filteredOptions.length,
            minStrike: 0,
            maxStrike: 0,
            zeroGammaCrossingPair: null,
            callWallStrike: null,
            callWallValue: null,
            putWallStrike: null,
            putWallValue: null,
          }
        : undefined,
    };
  }

  const minStrike = Math.min(...filteredOptions.map((c) => c.strike));
  const maxStrike = Math.max(...filteredOptions.map((c) => c.strike));

  type Acc = { callGex: number; putGex: number; callOi: number; putOi: number };
  const strikeMap = new Map<number, Acc>();
  let totalCallGEX = 0;
  let totalCallOI = 0;
  let totalPutOI = 0;

  for (const c of filteredOptions) {
    const gammaVal = resolveGamma(c, riskFreeRate);
    let exposure = contractGammaExposure(c, gammaVal, spotSq);
    if (useDistanceWeight) exposure *= distanceWeight(c.strike, spot);
    const oi = c.openInterest;
    const key = c.strike;
    const existing = strikeMap.get(key) ?? { callGex: 0, putGex: 0, callOi: 0, putOi: 0 };

    if (c.type === "call") {
      existing.callGex += exposure;
      existing.callOi += oi;
      totalCallGEX += exposure;
      totalCallOI += oi;
    } else {
      existing.putGex += exposure;
      existing.putOi += oi;
      totalPutOI += oi;
    }
    strikeMap.set(key, existing);
  }

  const strikeExposures: StrikeExposure[] = [...strikeMap.entries()]
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

  const totalPutGEX = strikeExposures.reduce((s, x) => s + x.putExposure, 0);
  const netGEX = totalCallGEX + totalPutGEX;
  const gammaRegime: GammaRegime =
    netGEX > 0 ? "positive" : netGEX < 0 ? "negative" : "neutral";

  // Zero gamma: cumulative net GEX across filtered strikes; interpolate at first sign change
  let zeroGammaLevel: number | null = null;
  let zeroGammaCrossingPair: [number, number] | null = null;
  let running = 0;
  const sorted = strikeExposures;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const prevStrike = i > 0 ? sorted[i - 1].strike : s.strike;
    const next = running + s.netExposure;
    if (running <= 0 && next > 0) {
      if (next !== running) {
        const frac = (0 - running) / (next - running);
        zeroGammaLevel = prevStrike + frac * (s.strike - prevStrike);
      } else {
        zeroGammaLevel = s.strike;
      }
      zeroGammaCrossingPair = [prevStrike, s.strike];
      break;
    }
    if (running >= 0 && next < 0) {
      if (next !== running) {
        const frac = (0 - running) / (next - running);
        zeroGammaLevel = prevStrike + frac * (s.strike - prevStrike);
      } else {
        zeroGammaLevel = s.strike;
      }
      zeroGammaCrossingPair = [prevStrike, s.strike];
      break;
    }
    running = next;
  }

  // Call wall: strike with maximum positive call GEX
  const byCall = strikeExposures.length > 0 ? [...strikeExposures].sort((a, b) => b.callExposure - a.callExposure)[0] : null;
  const callWall = byCall?.strike ?? null;
  const callWallValue = byCall?.callExposure ?? null;

  // Put wall: strike with maximum absolute put GEX (most negative in our convention)
  const byPut = strikeExposures.length > 0 ? [...strikeExposures].sort((a, b) => a.putExposure - b.putExposure)[0] : null;
  const putWall = byPut?.strike ?? null;
  const putWallValue = byPut?.putExposure ?? null;

  // Strongest +: strike with highest net positive GEX; Strongest -: strike with lowest net GEX
  const byNetPos = strikeExposures.length > 0 ? [...strikeExposures].sort((a, b) => b.netExposure - a.netExposure)[0] : null;
  const byNetNeg = strikeExposures.length > 0 ? [...strikeExposures].sort((a, b) => a.netExposure - b.netExposure)[0] : null;
  const strongestPositiveStrike = byNetPos?.strike ?? null;
  const strongestNegativeStrike = byNetNeg?.strike ?? null;

  // Vol trigger: largest strike below spot where net GEX < 0
  let volTrigger: number | null = null;
  const belowSpot = strikeExposures.filter((s) => s.strike < spot && s.netExposure < 0);
  if (belowSpot.length > 0) {
    volTrigger = belowSpot.reduce((best, s) => (s.strike > best ? s.strike : best), belowSpot[0].strike);
  }

  const putCallOIRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : null;

  const chainWithLabel = chain as OptionChainResult & { expirationRangeLabel?: string };
  const nearestExpirationUsed =
    chainWithLabel.expirationRangeLabel != null && chainWithLabel.expirationRangeLabel !== ""
      ? chainWithLabel.expirationRangeLabel
      : new Date(chain.nearestExpiration).toISOString().slice(0, 10);

  const marketSummary = [
    `Spot: $${spot.toFixed(2)}`,
    `Net GEX: ${(netGEX / 1e9).toFixed(2)}B`,
    `Regime: ${gammaRegime}`,
    zeroGammaLevel != null ? `Zero gamma ~$${Math.round(zeroGammaLevel).toLocaleString()}` : "No crossing in filtered range",
    callWall != null ? `Call wall $${callWall.toLocaleString()}` : "",
    putWall != null ? `Put wall $${putWall.toLocaleString()}` : "",
    putCallOIRatio != null ? `P/C OI ratio ${putCallOIRatio.toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return {
    spotPrice: spot,
    totalGEX: netGEX,
    callGEX: totalCallGEX,
    putGEX: totalPutGEX,
    netGEX,
    gammaRegime,
    zeroGammaLevel,
    callWall,
    putWall,
    strongestPositiveStrike,
    strongestNegativeStrike,
    volTrigger,
    putCallOIRatio,
    nearestExpirationUsed,
    strikeExposures,
    marketSummary,
    debug: includeDebug
      ? {
          optionsBeforeFilter,
          optionsAfterFilter: filteredOptions.length,
          minStrike,
          maxStrike,
          zeroGammaCrossingPair,
          callWallStrike: callWall,
          callWallValue,
          putWallStrike: putWall,
          putWallValue,
        }
      : undefined,
  };
}
