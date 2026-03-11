/**
 * Black-Scholes gamma for a single option.
 * Used when the market data provider does not return gamma.
 *
 * Gamma = N'(d1) / (S * sigma * sqrt(T))
 * where d1 = (ln(S/K) + (r + sigma^2/2)*T) / (sigma * sqrt(T))
 * N' is the standard normal PDF.
 */

const RISK_FREE_RATE = Number(process.env.RISK_FREE_RATE) || 0.04;

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Normalize IV to decimal for Black-Scholes (e.g. 0.25 = 25%).
 * Yahoo may return 0.25 or 1.58 (158%); if value > 2 assume percentage (e.g. 25 -> 0.25).
 */
function normalizeIv(iv: number): number {
  if (!Number.isFinite(iv) || iv <= 0) return 0.2;
  if (iv > 2) return iv / 100;
  return Math.min(iv, 2);
}

/**
 * @param spot - Underlying price
 * @param strike - Strike price
 * @param iv - Implied volatility (e.g. 0.25 for 25% or 25 for 25%)
 * @param timeToExpiryYears - Time to expiration in years
 * @param r - Risk-free rate (default from env or 0.04)
 */
export function gamma(
  spot: number,
  strike: number,
  iv: number,
  timeToExpiryYears: number,
  r: number = RISK_FREE_RATE
): number {
  const sigma = normalizeIv(iv);
  const t = Math.max(timeToExpiryYears, 1 / 365.25); // minimum ~1 day to avoid div by zero
  if (spot <= 0 || strike <= 0 || sigma <= 0) return 0;
  const sqrtT = Math.sqrt(t);
  const sigmaSqrtT = sigma * sqrtT;
  const d1 =
    (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * t) / sigmaSqrtT;
  const nd1 = normalPdf(d1);
  const denom = spot * sigma * sqrtT;
  if (denom <= 0) return 0;
  return nd1 / denom;
}

/**
 * Calculate gamma for a single option (Black-Scholes).
 * Use when provider does not supply gamma.
 */
export function calculateGamma({
  spot,
  strike,
  iv,
  timeToExpiry,
  riskFreeRate = RISK_FREE_RATE,
}: {
  spot: number;
  strike: number;
  iv: number;
  timeToExpiry: number;
  riskFreeRate?: number;
}): number {
  return gamma(spot, strike, iv, timeToExpiry, riskFreeRate);
}

/**
 * Time to expiry in years from Unix timestamp (seconds) to expiration.
 */
export function timeToExpiryYears(expirationUnixSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  const sec = Math.max(0, expirationUnixSeconds - now);
  return sec / (365.25 * 24 * 60 * 60);
}
