/**
 * GEX (Gamma Exposure) calculations.
 *
 * Formula per contract (no early rounding; full precision until display):
 *   gammaExposure = gamma * openInterest * contractSize * spotPrice * spotPrice
 *   Calls: positive exposure.
 *   Puts: negative exposure.
 *
 * contractSize = 100.
 * Aggregate by strike: callGex, putGex, netGex per strike.
 */

import type { OptionContract, OptionChainResult } from "./types";
import { calculateGamma, timeToExpiryYears } from "./blackScholes";

const DEFAULT_CONTRACT_SIZE = 100;

export type StrikeExposure = {
  strike: number;
  callExposure: number;
  putExposure: number;
  netExposure: number;
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
  putCallOIRatio: number | null;
  nearestExpirationUsed: string;
  strikeExposures: StrikeExposure[];
  marketSummary: string;
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
 * Gamma exposure for one contract.
 * gammaExposure = gamma * openInterest * contractSize * spotPrice * spotPrice
 * Calls: positive. Puts: negative.
 */
function contractGammaExposure(
  c: OptionContract,
  gammaVal: number,
  spot: number
): number {
  const size = c.contractSize ?? DEFAULT_CONTRACT_SIZE;
  const exposure = gammaVal * c.openInterest * size * spot * spot;
  return c.type === "call" ? exposure : -exposure;
}

/**
 * Compute full GEX metrics from an option chain.
 * Full precision until display; aggregate by strike then derive net, walls, zero gamma.
 */
export function computeGEX(
  chain: OptionChainResult,
  options?: { riskFreeRate?: number }
): GEXResult {
  const riskFreeRate = options?.riskFreeRate ?? 0.04;
  const spot = chain.underlyingPrice;

  const totalOI = chain.options.reduce((s, c) => s + c.openInterest, 0);
  console.log("[GEX] computeGEX spot:", spot, "options count:", chain.options.length, "total openInterest:", totalOI);

  const strikeMap = new Map<number, { callGex: number; putGex: number }>();
  let totalCallGEX = 0;
  let totalPutGEX = 0;
  let logged = 0;
  const LOG_SAMPLE = 5;

  for (const c of chain.options) {
    const gammaVal = resolveGamma(c, riskFreeRate);
    const exposure = contractGammaExposure(c, gammaVal, spot);
    const openInterest = c.openInterest;

    if (logged < LOG_SAMPLE) {
      console.log({
        strike: c.strike,
        gamma: gammaVal,
        openInterest,
        exposure,
        type: c.type,
      });
      logged += 1;
    }

    const key = c.strike;
    const existing = strikeMap.get(key) ?? { callGex: 0, putGex: 0 };
    if (c.type === "call") {
      existing.callGex += exposure;
      totalCallGEX += exposure;
    } else {
      existing.putGex += exposure;
      totalPutGEX += exposure;
    }
    strikeMap.set(key, existing);
  }

  const strikeExposures: StrikeExposure[] = [...strikeMap.entries()]
    .map(([strike, { callGex, putGex }]) => ({
      strike,
      callExposure: callGex,
      putExposure: putGex,
      netExposure: callGex + putGex,
    }))
    .sort((a, b) => a.strike - b.strike);

  const netGEX = totalCallGEX + totalPutGEX;
  const gammaRegime: GammaRegime =
    netGEX > 1e6 ? "positive" : netGEX < -1e6 ? "negative" : "neutral";

  let zeroGammaLevel: number | null = null;
  let running = 0;
  for (const s of strikeExposures) {
    const next = running + s.netExposure;
    if (running <= 0 && next > 0) {
      zeroGammaLevel = s.strike;
      break;
    }
    if (running >= 0 && next < 0) {
      zeroGammaLevel = s.strike;
      break;
    }
    running = next;
  }

  let callWall: number | null = null;
  let putWall: number | null = null;
  let strongestPositiveStrike: number | null = null;
  let strongestNegativeStrike: number | null = null;
  if (strikeExposures.length > 0) {
    const byCall = [...strikeExposures].sort((a, b) => b.callExposure - a.callExposure)[0];
    const byPut = [...strikeExposures].sort((a, b) => Math.abs(b.putExposure) - Math.abs(a.putExposure))[0];
    const byNetPos = [...strikeExposures].sort((a, b) => b.netExposure - a.netExposure)[0];
    const byNetNeg = [...strikeExposures].sort((a, b) => a.netExposure - b.netExposure)[0];
    callWall = byCall?.strike ?? null;
    putWall = byPut?.strike ?? null;
    strongestPositiveStrike = byNetPos?.strike ?? null;
    strongestNegativeStrike = byNetNeg?.strike ?? null;
  }

  const totalCallOI = chain.options
    .filter((c) => c.type === "call")
    .reduce((s, c) => s + c.openInterest, 0);
  const totalPutOI = chain.options
    .filter((c) => c.type === "put")
    .reduce((s, c) => s + c.openInterest, 0);
  const putCallOIRatio =
    totalCallOI > 0 ? totalPutOI / totalCallOI : null;

  const nearestExpirationUsed = new Date(
    chain.nearestExpiration
  ).toISOString().slice(0, 10);

  const marketSummary = [
    `Spot: $${spot.toFixed(2)}`,
    `Net GEX: ${(netGEX / 1e9).toFixed(2)}B`,
    `Regime: ${gammaRegime}`,
    zeroGammaLevel != null ? `Zero gamma ~$${zeroGammaLevel}` : "",
    callWall != null ? `Call wall $${callWall}` : "",
    putWall != null ? `Put wall $${putWall}` : "",
    putCallOIRatio != null ? `P/C OI ratio ${putCallOIRatio.toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join(". ");

  const totalGEX = totalCallGEX + totalPutGEX;
  return {
    spotPrice: spot,
    totalGEX,
    callGEX: totalCallGEX,
    putGEX: totalPutGEX,
    netGEX: totalGEX,
    gammaRegime,
    zeroGammaLevel,
    callWall,
    putWall,
    strongestPositiveStrike,
    strongestNegativeStrike,
    putCallOIRatio,
    nearestExpirationUsed,
    strikeExposures,
    marketSummary,
  };
}
