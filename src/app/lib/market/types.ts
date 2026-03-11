/**
 * Market data provider interface.
 * Allows swapping Yahoo for Tradier (or others) without rewriting GEX logic.
 */

export type FuturesQuote = {
  symbol: string;
  price: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  currency?: string;
};

export type OptionContract = {
  strike: number;
  type: "call" | "put";
  openInterest: number;
  impliedVolatility: number | null;
  /** Gamma from provider if available; otherwise computed via Black-Scholes */
  gamma: number | null;
  expiration: number; // Unix timestamp
  underlyingPrice: number;
  /** Contract multiplier, default 100 */
  contractSize?: number;
};

export type OptionChainResult = {
  symbol: string;
  underlyingPrice: number;
  expirationDates: number[];
  strikes: number[];
  options: OptionContract[];
  /** Nearest expiration used (Unix ms) */
  nearestExpiration: number;
};

export type MarketDataProvider = {
  /** Fetch futures quote (ES=F, NQ=F, GC=F, SI=F) */
  getFuturesQuote(symbol: string): Promise<FuturesQuote | null>;
  /** Fetch option chain for underlying (SPY, QQQ). Used as proxy for ES/NQ GEX. */
  getOptionChain(
    symbol: string,
    options?: { expirationTimestamp?: number }
  ): Promise<OptionChainResult | null>;
  /** List available expiration timestamps for a symbol */
  getOptionExpirations(symbol: string): Promise<number[]>;
};
