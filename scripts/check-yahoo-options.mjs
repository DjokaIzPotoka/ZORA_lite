/**
 * Run with: node scripts/check-yahoo-options.mjs
 * Inspects the actual shape of yahoo-finance2 options('SPY') response.
 */
import YahooFinance from "yahoo-finance2";

const client = new YahooFinance();
const result = await client.options("SPY");
console.log("Top-level keys:", Object.keys(result));
console.log("quote keys:", result.quote ? Object.keys(result.quote) : "no quote");
console.log("regularMarketPrice:", result.quote?.regularMarketPrice);
console.log("options is array:", Array.isArray(result.options));
console.log("options length:", result.options?.length);
if (Array.isArray(result.options) && result.options[0]) {
  const first = result.options[0];
  console.log("first expiration keys:", Object.keys(first));
  console.log("first expiration expirationDate:", first.expirationDate);
  console.log("calls length:", first.calls?.length);
  console.log("puts length:", first.puts?.length);
  if (first.calls?.[0]) {
    const sample = first.calls[0];
    console.log("first call keys:", Object.keys(sample));
    console.log("first call strike:", sample.strike);
    console.log("first call openInterest:", sample.openInterest);
    console.log("first call volume:", sample.volume);
    console.log("first call impliedVolatility:", sample.impliedVolatility);
  }
}
