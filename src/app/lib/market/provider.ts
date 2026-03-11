/**
 * Server-side only. Import from gexData or other "use server" modules.
 */
import type { MarketDataProvider } from "./types";
import { YahooMarketDataProvider } from "./yahoo";

const PROVIDER = process.env.MARKET_DATA_PROVIDER || "yahoo";

/**
 * Resolve the active market data provider.
 * Ready for Tradier: if PROVIDER === "tradier", return TradierMarketDataProvider.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (PROVIDER === "yahoo") return YahooMarketDataProvider;
  // Future: if (PROVIDER === "tradier") return new TradierMarketDataProvider();
  return YahooMarketDataProvider;
}
