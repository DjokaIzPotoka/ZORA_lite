/**
 * Server-side only. Used by provider.ts / gexData.ts. Do not add "use server" — this module
 * exports an object (YahooMarketDataProvider); "use server" files may only export async functions.
 */
import type {
  MarketDataProvider,
  FuturesQuote,
  OptionChainResult,
  OptionContract,
} from "./types";

/**
 * Raw option row from Yahoo options API (calls/puts array items).
 * API may use camelCase or different keys; we read with fallbacks.
 */
type YahooOptionRow = Record<string, unknown>;

type YahooOptionsExpiration = {
  expirationDate: number | string | Date;
  calls: YahooOptionRow[];
  puts: YahooOptionRow[];
};

type YahooOptionsResult = {
  quote?: { regularMarketPrice?: number };
  expirationDates?: number[];
  strikes?: number[];
  options?: YahooOptionsExpiration[];
};

function toFuturesQuote(raw: {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  [key: string]: unknown;
}): FuturesQuote {
  const price = Number(raw.regularMarketPrice) || 0;
  const prev = Number(raw.regularMarketPreviousClose);
  const change = Number.isFinite(prev) ? price - prev : undefined;
  const changePercent =
    Number.isFinite(prev) && prev !== 0 && change !== undefined
      ? (change / prev) * 100
      : undefined;
  return {
    symbol: String(raw.symbol ?? ""),
    price,
    previousClose: Number.isFinite(prev) ? prev : undefined,
    change,
    changePercent,
    currency: "USD",
  };
}

/** Normalize expiration to Unix seconds. Yahoo may return Date, ISO string, seconds, or ms. */
function toExpirationSeconds(val: number | string | Date): number {
  if (val instanceof Date) return Math.floor(val.getTime() / 1000);
  if (typeof val === "string") {
    const ms = Date.parse(val);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  const n = Number(val);
  if (!Number.isFinite(n)) return Math.floor(Date.now() / 1000) + 86400 * 7;
  if (n > 1e12) return Math.floor(n / 1000);
  return n;
}

/** IV as decimal 0–1. If > 1, treat as percentage. */
function toImpliedVolatility(val: unknown): number | null {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1 ? n / 100 : n;
}

/** Get numeric value from row with optional alternate keys (API may use different names). */
function getNum(row: YahooOptionRow, ...keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v != null && (typeof v === "number" || typeof v === "string")) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function mapExpirationToContracts(
  exp: YahooOptionsExpiration,
  underlyingPrice: number,
  contractSize: number
): OptionContract[] {
  const expiration = toExpirationSeconds(exp.expirationDate);
  const list: OptionContract[] = [];
  const calls = exp.calls ?? [];
  const puts = exp.puts ?? [];
  for (const c of calls) {
    const oi = Math.max(0, getNum(c, "openInterest", "open_interest") || getNum(c, "volume"));
    list.push({
      strike: getNum(c, "strike"),
      type: "call",
      openInterest: oi,
      impliedVolatility: toImpliedVolatility(c.impliedVolatility ?? c.implied_volatility),
      gamma: c.gamma != null && Number.isFinite(Number(c.gamma)) ? Number(c.gamma) : null,
      expiration,
      underlyingPrice,
      contractSize,
    });
  }
  for (const p of puts) {
    const oi = Math.max(0, getNum(p, "openInterest", "open_interest") || getNum(p, "volume"));
    list.push({
      strike: getNum(p, "strike"),
      type: "put",
      openInterest: oi,
      impliedVolatility: toImpliedVolatility(p.impliedVolatility ?? p.implied_volatility),
      gamma: p.gamma != null && Number.isFinite(Number(p.gamma)) ? Number(p.gamma) : null,
      expiration,
      underlyingPrice,
      contractSize,
    });
  }
  return list;
}

async function getYahooQuote(symbol: string): Promise<FuturesQuote | null> {
  try {
    const mod = await import("yahoo-finance2");
    const YahooFinance = (mod as { default: new () => { quote: (s: string) => Promise<unknown> } }).default;
    const client = new YahooFinance();
    const result = await client.quote(symbol);
    if (!result || typeof result !== "object") return null;
    return toFuturesQuote(result as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function getYahooOptions(symbol: string): Promise<YahooOptionsResult | null> {
  try {
    const mod = await import("yahoo-finance2");
    const YahooFinance = (mod as { default: new () => { options: (s: string) => Promise<unknown> } }).default;
    const client = new YahooFinance();
    const result = await client.options(symbol);
    if (!result || typeof result !== "object") return null;
    const data = result as Record<string, unknown>;
    if (Array.isArray(data.options) && data.options.length > 0) {
      const first = (data.options[0] as Record<string, unknown>);
      const calls = (first.calls as unknown[]) ?? [];
      const puts = (first.puts as unknown[]) ?? [];
      if (calls.length > 0) {
        const sample = calls[0] as Record<string, unknown>;
        console.log("[GEX] Yahoo options sample call keys:", Object.keys(sample));
        console.log("[GEX] Yahoo sample call openInterest/volume:", sample.openInterest, sample.volume, sample.open_interest);
      }
    }
    return result as YahooOptionsResult;
  } catch (e) {
    console.error("[GEX] getYahooOptions error:", e);
    return null;
  }
}

export const YahooMarketDataProvider: MarketDataProvider = {
  async getFuturesQuote(symbol: string): Promise<FuturesQuote | null> {
    return getYahooQuote(symbol);
  },

  async getOptionExpirations(symbol: string): Promise<number[]> {
    const data = await getYahooOptions(symbol);
    if (!data?.expirationDates?.length) return [];
    return data.expirationDates;
  },

  async getOptionChain(
    symbol: string,
    opts?: { expirationTimestamp?: number }
  ): Promise<OptionChainResult | null> {
    const raw = await getYahooOptions(symbol);
    if (!raw) return null;

    const data = raw as Record<string, unknown>;
    const quote = data.quote as Record<string, unknown> | undefined;
    const underlyingPrice = Math.max(
      0,
      Number(quote?.regularMarketPrice) ||
      Number(quote?.regularMarketPreviousClose) ||
      0
    );
    if (underlyingPrice <= 0) {
      console.log("[GEX] underlyingPrice is 0; quote keys:", quote ? Object.keys(quote) : "no quote");
    }
    const contractSize = 100;

    let optionsArray: YahooOptionsExpiration[] = [];
    if (Array.isArray(data.options) && data.options.length > 0) {
      optionsArray = data.options as YahooOptionsExpiration[];
    } else if (data.options && typeof data.options === "object" && !Array.isArray(data.options)) {
      const optsByDate = data.options as Record<string, { expirationDate?: number; calls?: YahooOptionRow[]; puts?: YahooOptionRow[] }>;
      optionsArray = Object.entries(optsByDate).map(([k, v]) => ({
        expirationDate: Number(v.expirationDate) || Number(k),
        calls: v.calls ?? [],
        puts: v.puts ?? [],
      }));
    } else if (Array.isArray(data.calls) || Array.isArray(data.puts)) {
      const exp = (data.expirationDate ?? (data.expirationDates as number[])?.[0]) ?? Date.now() / 1000 + 86400 * 7;
      optionsArray = [{
        expirationDate: exp,
        calls: (data.calls as YahooOptionRow[]) ?? [],
        puts: (data.puts as YahooOptionRow[]) ?? [],
      }];
    }

    if (optionsArray.length === 0) {
      console.log("[GEX] No options array; data keys:", Object.keys(data));
      return null;
    }

    const targetTs = opts?.expirationTimestamp;
    const nearest = targetTs
      ? optionsArray.reduce((best, e) => {
          const bSec = toExpirationSeconds(best.expirationDate);
          const eSec = toExpirationSeconds(e.expirationDate);
          const targetSec = targetTs / 1000;
          return Math.abs(eSec - targetSec) < Math.abs(bSec - targetSec) ? e : best;
        })
      : optionsArray[0];
    const nearestExpirationSec = toExpirationSeconds(nearest.expirationDate);

    const allContracts = mapExpirationToContracts(
      nearest,
      underlyingPrice,
      contractSize
    );
    const strikes = [...new Set(allContracts.map((c) => c.strike))].sort(
      (a, b) => a - b
    );
    const expirationDates = (data.expirationDates as number[] | undefined) ?? optionsArray.map((e) => toExpirationSeconds(e.expirationDate));

    return {
      symbol,
      underlyingPrice,
      expirationDates,
      strikes,
      options: allContracts,
      nearestExpiration: nearestExpirationSec * 1000,
    };
  },
};
