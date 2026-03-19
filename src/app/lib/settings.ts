const LEGACY_STORAGE_KEY = "trading_journal_starting_balance";
const CRYPTO_BALANCE_KEY = "trading_journal_starting_balance_crypto";
const STOCKS_BALANCE_KEY = "trading_journal_starting_balance_stocks";

const DEFAULT_BALANCE = 10000;

function readNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    const n = Number.isFinite(value) ? Math.max(0, value) : 0;
    localStorage.setItem(key, String(n));
  } catch {
    // ignore
  }
}

/** Crypto starting balance. Default 10000. Migrates from legacy single balance (half each) if set. */
export function getStartingBalanceCrypto(): number {
  const v = readNumber(CRYPTO_BALANCE_KEY);
  if (v != null) return v;
  const legacy = readNumber(LEGACY_STORAGE_KEY);
  if (legacy != null && legacy > 0) return Math.round(legacy / 2);
  return DEFAULT_BALANCE;
}

/** Stocks starting balance. Default 10000. Migrates from legacy single balance (half each) if set. */
export function getStartingBalanceStocks(): number {
  const v = readNumber(STOCKS_BALANCE_KEY);
  if (v != null) return v;
  const legacy = readNumber(LEGACY_STORAGE_KEY);
  if (legacy != null && legacy > 0) return Math.round(legacy / 2);
  return DEFAULT_BALANCE;
}

export function setStartingBalanceCrypto(value: number): void {
  writeNumber(CRYPTO_BALANCE_KEY, value);
}

export function setStartingBalanceStocks(value: number): void {
  writeNumber(STOCKS_BALANCE_KEY, value);
}

/** Total starting balance (crypto + stocks). */
export function getStartingBalanceAll(): number {
  return getStartingBalanceCrypto() + getStartingBalanceStocks();
}

/** Starting balance for the given market filter. When "all", always crypto + stocks so total balance = crypto balance + stocks balance. */
export function getStartingBalanceForFilter(
  filter: "all" | "crypto" | "stocks"
): number {
  if (filter === "crypto") return getStartingBalanceCrypto();
  if (filter === "stocks") return getStartingBalanceStocks();
  return getStartingBalanceAll();
}

/** Total starting balance. Legacy key if set (backward compat), else crypto+stocks. */
export function getStartingBalance(): number {
  const legacy = readNumber(LEGACY_STORAGE_KEY);
  if (legacy != null && legacy >= 0) return legacy;
  return getStartingBalanceAll();
}

export function setStartingBalance(value: number): void {
  writeNumber(LEGACY_STORAGE_KEY, value);
}

function clearLegacyStartingBalance(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Persist starting balance for the active market filter so that
 * startingBalance + realized P&L matches a chosen total balance.
 * For "all", splits the combined starting across crypto/stocks (keeps ratio; equal split if both were zero).
 */
export function applyEffectiveStartingForFilter(
  filter: "all" | "crypto" | "stocks",
  effectiveStarting: number
): void {
  const s = Math.max(0, Number.isFinite(effectiveStarting) ? effectiveStarting : 0);
  if (filter === "crypto") {
    setStartingBalanceCrypto(s);
    return;
  }
  if (filter === "stocks") {
    setStartingBalanceStocks(s);
    return;
  }
  clearLegacyStartingBalance();
  const c = getStartingBalanceCrypto();
  const st = getStartingBalanceStocks();
  const sum = c + st;
  if (sum <= 0) {
    const half = Math.round((s / 2) * 100) / 100;
    setStartingBalanceCrypto(half);
    setStartingBalanceStocks(Math.round((s - half) * 100) / 100);
    return;
  }
  const newC = Math.round(s * (c / sum) * 100) / 100;
  setStartingBalanceCrypto(newC);
  setStartingBalanceStocks(Math.round((s - newC) * 100) / 100);
}
