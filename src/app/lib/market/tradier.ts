/**
 * Tradier API client for options chain and quote data.
 * Used by the GEX engine to fetch chain data for a selected symbol.
 * Requires TRADIER_ACCESS_TOKEN (or TRADIER_API_KEY) in env.
 */

import type { OptionChainResult, OptionContract, FuturesQuote } from "./types";

// #region agent log
function _dbg(location: string, message: string, data: Record<string, unknown>, hypothesisId?: string) {
  const payload = { sessionId: "7a93b0", location, message, data, timestamp: Date.now(), ...(hypothesisId && { hypothesisId }) };
  fetch("http://127.0.0.1:7242/ingest/8a16eeec-6b72-41f4-9614-55f64ad0f10d", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a93b0" }, body: JSON.stringify(payload) }).catch(() => {});
}
// #endregion

const TRADIER_BASE =
  process.env.TRADIER_API_BASE || "https://api.tradier.com";

/** Read token at call time so .env.local is always respected (e.g. after restart). */
function getTradierToken(): string {
  return (
    (process.env.TRADIER_ACCESS_TOKEN ?? "").trim() ||
    (process.env.TRADIER_API_KEY ?? "").trim()
  );
}

/** Use this to show a clear error when the token is missing. */
export function isTradierConfigured(): boolean {
  return getTradierToken().length > 0;
}

/** Raw option from Tradier chain response (with greeks=true). */
export type TradierOptionRow = {
  symbol?: string;
  strike?: number;
  option_type?: string;
  open_interest?: number;
  bid?: number;
  ask?: number;
  expiration_date?: string;
  contract_size?: number;
  underlying?: string;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    bid_iv?: number;
    mid_iv?: number;
    ask_iv?: number;
    smv_vol?: number;
    updated_at?: string;
  };
  [key: string]: unknown;
};

/** Raw chain response: options.option can be single object or array. */
type TradierChainPayload = {
  options?: { option?: TradierOptionRow | TradierOptionRow[] };
};

/** Raw quote response. */
type TradierQuotePayload = {
  quote?: {
    symbol?: string;
    last?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    previous_close?: number;
    change?: number;
    change_percentage?: number;
  };
};

/** Raw expirations response. */
type TradierExpirationsPayload = {
  expirations?: { date?: string | string[] };
};

const DEFAULT_CONTRACT_SIZE = 100;
/** Minimum time to expiry in years to avoid division by zero (~1 hour). */
const MIN_T_YEARS = 1 / (365.25 * 24);

/**
 * Parse expiration date YYYY-MM-DD to Unix seconds (end of session, 4pm ET approx as 20:00 UTC).
 */
function expirationDateToUnixSeconds(expirationDate: string): number {
  const d = new Date(expirationDate + "T20:00:00Z");
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return Math.floor(Date.now() / 1000) + 86400;
  return Math.floor(ms / 1000);
}

/**
 * Normalize IV to decimal for Black-Scholes.
 * Tradier/ORATS may return decimal (0.25) or percent (25); if > 2 treat as percent.
 */
export function normalizeIV(iv: number | null | undefined): number {
  if (iv == null || !Number.isFinite(iv) || iv <= 0) return 0.2;
  if (iv > 2) return iv / 100;
  return Math.min(iv, 2);
}

/**
 * Time to expiry in years from expiration Unix seconds.
 */
export function getTimeToExpiry(expirationUnixSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  const sec = Math.max(0, expirationUnixSeconds - now);
  const t = sec / (365.25 * 24 * 60 * 60);
  return Math.max(t, MIN_T_YEARS);
}

function ensureArray<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Fetch underlying quote (spot price) from Tradier.
 */
export async function fetchTradierQuote(symbol: string): Promise<FuturesQuote | null> {
  const token = getTradierToken();
  if (!token) return null;
  // #region agent log
  _dbg("tradier.ts:fetchTradierQuote", "quote request", { symbol }, "H1");
  // #endregion
  try {
    const url = `${TRADIER_BASE}/v1/markets/quotes?symbols=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    // #region agent log
    if (!res.ok) _dbg("tradier.ts:fetchTradierQuote", "quote res not ok", { symbol, status: res.status }, "H1");
    // #endregion
    if (!res.ok) return null;
    const data = (await res.json()) as TradierQuotePayload;
    const q = data?.quote;
    const price = q ? Number(q.last ?? q.close ?? q.previous_close) || 0 : 0;
    // #region agent log
    if (!q || price <= 0) _dbg("tradier.ts:fetchTradierQuote", "quote null or price<=0", { symbol, hasQ: !!q, price }, "H1");
    // #endregion
    if (!q) return null;
    if (price <= 0) return null;
    const prev = Number(q.previous_close);
    const change = Number.isFinite(prev) ? price - prev : undefined;
    const changePercent =
      Number.isFinite(prev) && prev !== 0 && change !== undefined
        ? (change / prev) * 100
        : undefined;
    return {
      symbol: String(q.symbol ?? symbol),
      price,
      previousClose: Number.isFinite(prev) ? prev : undefined,
      change,
      changePercent,
      currency: "USD",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch option expiration dates for a symbol.
 */
export async function fetchTradierExpirations(symbol: string): Promise<string[]> {
  const token = getTradierToken();
  if (!token) return [];
  // #region agent log
  _dbg("tradier.ts:fetchTradierExpirations", "expirations request", { symbol }, "H2");
  // #endregion
  try {
    const url = `${TRADIER_BASE}/v1/markets/options/expirations?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    // #region agent log
    if (!res.ok) _dbg("tradier.ts:fetchTradierExpirations", "expirations res not ok", { symbol, status: res.status }, "H2");
    // #endregion
    if (!res.ok) return [];
    const data = (await res.json()) as TradierExpirationsPayload;
    const dates = data?.expirations?.date;
    const arr = ensureArray(dates).filter((d): d is string => typeof d === "string");
    const out = arr.sort();
    // #region agent log
    _dbg("tradier.ts:fetchTradierExpirations", "expirations result", { symbol, count: out.length, first: out[0] ?? null }, "H2");
    // #endregion
    return out;
  } catch (e) {
    // #region agent log
    _dbg("tradier.ts:fetchTradierExpirations", "expirations catch", { symbol, err: String(e) }, "H2");
    // #endregion
    return [];
  }
}

/**
 * Fetch options chain for symbol and expiration (YYYY-MM-DD).
 * Requests greeks=true for IV and gamma when available.
 */
export async function fetchTradierChain(
  symbol: string,
  expiration: string,
  options?: { spotPrice?: number }
): Promise<OptionChainResult | null> {
  const token = getTradierToken();
  if (!token) return null;
  // #region agent log
  _dbg("tradier.ts:fetchTradierChain", "chain request", { symbol, expiration }, "H3");
  // #endregion
  try {
    const url = `${TRADIER_BASE}/v1/markets/options/chains?symbol=${encodeURIComponent(symbol)}&expiration=${expiration}&greeks=true`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const body = await res.text();
    // #region agent log
    if (!res.ok) _dbg("tradier.ts:fetchTradierChain", "chain res not ok", { symbol, status: res.status, bodySnippet: body.slice(0, 200) }, "H3");
    // #endregion
    if (!res.ok) return null;
    const data = JSON.parse(body) as TradierChainPayload;
    const optionList = data?.options?.option;
    const rows = ensureArray(optionList);
    // #region agent log
    _dbg("tradier.ts:fetchTradierChain", "chain raw rows", { symbol, expiration, rowsLength: rows.length }, "H4");
    if (rows.length === 0) _dbg("tradier.ts:fetchTradierChain", "chain empty options", { symbol }, "H4");
    // #endregion
    if (rows.length === 0) return null;

    const spot =
      options?.spotPrice ??
      (await fetchTradierQuote(symbol))?.price ??
      0;
    if (spot <= 0) return null;

    const expirationSec = expirationDateToUnixSeconds(expiration);
    const contracts: OptionContract[] = [];
    const strikesSet = new Set<number>();

    for (const row of rows) {
      const strike = Number(row.strike);
      if (!Number.isFinite(strike) || strike <= 0) continue;
      const oi = Math.max(0, Number(row.open_interest) || 0);
      const type = String(row.option_type ?? "").toLowerCase();
      if (type !== "call" && type !== "put") continue;

      const ivRaw = row.greeks?.mid_iv ?? row.greeks?.ask_iv ?? row.greeks?.bid_iv ?? row.greeks?.smv_vol;
      const iv = normalizeIV(ivRaw != null ? Number(ivRaw) : null);
      if (iv <= 0) continue;

      const t = getTimeToExpiry(expirationSec);
      if (t <= 0) continue;

      const gammaFromProvider =
        row.greeks?.gamma != null && Number.isFinite(Number(row.greeks.gamma)) && Number(row.greeks.gamma) > 0
          ? Number(row.greeks.gamma)
          : null;

      strikesSet.add(strike);
      contracts.push({
        strike,
        type: type as "call" | "put",
        openInterest: oi,
        impliedVolatility: iv,
        gamma: gammaFromProvider,
        expiration: expirationSec,
        underlyingPrice: spot,
        contractSize: Number(row.contract_size) || DEFAULT_CONTRACT_SIZE,
      });
    }

    const strikes = [...strikesSet].sort((a, b) => a - b);
    const expirationDates = [expirationSec];

    // #region agent log
    if (contracts.length === 0) _dbg("tradier.ts:fetchTradierChain", "all options filtered out", { symbol, rawRows: rows.length }, "H5");
    // #endregion
    return {
      symbol,
      underlyingPrice: spot,
      expirationDates,
      strikes,
      options: contracts,
      nearestExpiration: expirationSec * 1000,
      expirationRangeLabel: expiration,
    };
  } catch (e) {
    // #region agent log
    _dbg("tradier.ts:fetchTradierChain", "chain catch", { symbol, err: String(e) }, "H3");
    // #endregion
    return null;
  }
}

/**
 * Fetch options chain for a symbol.
 * If expiration is provided, fetches that expiry only; otherwise uses nearest expiration.
 * When spotPriceOverride is provided and > 0, skips Tradier quote (use for index symbols SPX/NDX where quotes API returns no quote).
 */
export async function fetchTradierChainForSymbol(
  symbol: string,
  expiration?: string | null,
  spotPriceOverride?: number
): Promise<OptionChainResult | null> {
  // #region agent log
  _dbg("tradier.ts:fetchTradierChainForSymbol", "entry", { symbol, hasSpotOverride: spotPriceOverride != null && spotPriceOverride > 0 }, "H1");
  // #endregion
  let spot = spotPriceOverride ?? 0;
  if (spot <= 0) {
    const quote = await fetchTradierQuote(symbol);
    spot = quote?.price ?? 0;
    // #region agent log
    if (spot <= 0) _dbg("tradier.ts:fetchTradierChainForSymbol", "quote failed, returning null", { symbol, spot }, "H1");
    // #endregion
    if (spot <= 0) return null;
  }

  const expirations = await fetchTradierExpirations(symbol);
  // #region agent log
  if (expirations.length === 0) _dbg("tradier.ts:fetchTradierChainForSymbol", "no expirations, returning null", { symbol }, "H2");
  // #endregion
  if (expirations.length === 0) return null;

  const targetExpiration = expiration ?? expirations[0];
  if (!expirations.includes(targetExpiration)) {
    return fetchTradierChain(symbol, expirations[0], { spotPrice: spot });
  }
  return fetchTradierChain(symbol, targetExpiration, { spotPrice: spot });
}
