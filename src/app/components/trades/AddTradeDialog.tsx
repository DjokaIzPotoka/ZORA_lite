"use client";

import * as React from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import {
  calculatePnL,
  calculateCryptoPnL,
  calculateCryptoFees,
} from "../../lib/calculations";
import {
  insertTrade,
  updateTrade,
  type Market,
  type Trade,
  type TradeType,
} from "../../lib/trades";
import { getSymbolsForMarket } from "../../lib/symbols";

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Reverse of insertTrade note assembly: `Tags: …\n\nnotes` or plain notes. */
function splitNotesAndTags(stored: string | null): { tags: string; notes: string } {
  const s = (stored ?? "").trim();
  if (!s) return { tags: "", notes: "" };
  const m = s.match(/^Tags:\s*(.+?)(?:\n\n([\s\S]*))?$/);
  if (m) return { tags: m[1].trim(), notes: (m[2] ?? "").trim() };
  return { tags: "", notes: s };
}

type FormValues = {
  symbol: string;
  market: Market;
  type: TradeType;
  entry_price: number;
  exit_price: number;
  entry_date: string;
  qty: number;
  fees: number;
  notes: string;
  tags: string;
  leverage: number;
  position_margin: number;
};

const defaultValues: DefaultValues<FormValues> = {
  symbol: "",
  market: "cfd",
  type: "long",
  entry_price: 0,
  exit_price: 0,
  entry_date: "",
  qty: 0,
  fees: 0,
  notes: "",
  tags: "",
  leverage: 30,
  position_margin: 0,
};

type AddTradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Total balance (starting balance + realized P&L) for "position margin as % of balance" */
  totalBalance?: number;
  /** When set, dialog updates this trade instead of inserting. */
  tradeToEdit?: Trade | null;
};

export function AddTradeDialog({
  open,
  onOpenChange,
  onSuccess,
  totalBalance = 0,
  tradeToEdit = null,
}: AddTradeDialogProps) {
  const form = useForm<FormValues>({ defaultValues });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [symbolOpen, setSymbolOpen] = React.useState(false);
  const symbolListRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const dialogContentRef = React.useRef<HTMLDivElement>(null);

  const { register, watch, handleSubmit, reset, setValue } = form;

  const market = watch("market");
  const type = watch("type");
  const entry = watch("entry_price");
  const exit = watch("exit_price");
  const qty = watch("qty");
  const fees = watch("fees");
  const leverage = watch("leverage");
  const position_margin = watch("position_margin");
  const symbol = watch("symbol");

  const [marginMode, setMarginMode] = React.useState<"fixed" | "percent">("percent");
  const [marginPercent, setMarginPercent] = React.useState<number>(25);

  const isCrypto = market === "crypto";
  const symbolOptions = React.useMemo(() => getSymbolsForMarket(market), [market]);
  const [symbolFilter, setSymbolFilter] = React.useState("");
  const filteredSymbols = React.useMemo(() => {
    if (!symbolFilter.trim()) return symbolOptions;
    const q = symbolFilter.trim().toLowerCase();
    return symbolOptions.filter((s) => s.toLowerCase().includes(q));
  }, [symbolOptions, symbolFilter]);

  const marketField = register("market");

  React.useEffect(() => {
    if (!open) return;
    if (tradeToEdit) {
      const { tags, notes: noteBody } = splitNotesAndTags(tradeToEdit.notes);
      const lev = 30;
      const margin =
        tradeToEdit.market === "crypto" && lev > 0
          ? Math.round((tradeToEdit.qty / lev) * 100) / 100
          : 0;
      reset({
        symbol: tradeToEdit.symbol,
        market: tradeToEdit.market,
        type: tradeToEdit.type,
        entry_price: tradeToEdit.entry_price,
        exit_price: tradeToEdit.exit_price,
        entry_date: tradeToEdit.created_at.slice(0, 10),
        qty: tradeToEdit.qty,
        fees: tradeToEdit.fees,
        notes: noteBody,
        tags,
        leverage: lev,
        position_margin: margin,
      });
      setSymbolFilter("");
      setMarginMode("fixed");
      setMarginPercent(25);
    } else {
      reset(defaultValues);
      setValue("entry_date", getTodayDateString());
      setMarginMode("percent");
      setMarginPercent(25);
      setSymbolFilter("");
    }
  }, [open, tradeToEdit, reset, setValue]);

  // Lock body scroll when dialog is open; only dialog content should scroll
  React.useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // #region agent log
  React.useEffect(() => {
    if (!open) return;
    const el = overlayRef.current;
    const bodyOverflow = typeof document !== "undefined" ? document.body.style.overflow : "";
    const overlayOverflow = el ? getComputedStyle(el).overflowY : "";
    const contentEl = dialogContentRef.current;
    const contentScrollHeight = contentEl ? contentEl.scrollHeight : 0;
    const contentClientHeight = contentEl ? contentEl.clientHeight : 0;
    fetch("http://127.0.0.1:7242/ingest/ebee85db-df18-47be-af80-d2eb6c5e07bc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "AddTradeDialog.tsx:scroll-debug",
        message: "Dialog opened; overlay and body scroll state",
        data: {
          bodyOverflow,
          overlayOverflow,
          contentScrollHeight,
          contentClientHeight,
          contentOverflow: contentEl ? getComputedStyle(contentEl).overflowY : "",
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {});
  }, [open]);
  // #endregion

  // Close symbol dropdown on click outside; keep typed value as symbol
  React.useEffect(() => {
    if (!symbolOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (symbolListRef.current && !symbolListRef.current.contains(e.target as Node)) {
        setValue("symbol", symbolFilter);
        setSymbolOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [symbolOpen, symbolFilter, setValue]);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const round4 = (n: number) => Math.round(n * 10000) / 10000;

  // For crypto: position margin from % of balance when marginMode is "percent"
  React.useEffect(() => {
    if (!isCrypto || marginMode !== "percent") return;
    const balance = Number(totalBalance) || 0;
    const pct = Number(marginPercent) || 0;
    if (balance > 0 && pct > 0) {
      setValue("position_margin", round2((balance * pct) / 100));
    }
  }, [isCrypto, marginMode, totalBalance, marginPercent, setValue]);

  // For crypto: qty = leverage * position_margin when both are set (rounded to 2 decimals)
  React.useEffect(() => {
    if (!isCrypto) return;
    const lev = Number(leverage) || 0;
    const margin = Number(position_margin) || 0;
    if (lev > 0 && margin > 0) {
      setValue("qty", round2(lev * margin));
    }
  }, [isCrypto, leverage, position_margin, setValue]);

  // For crypto: auto-calculate fees from entry, exit, qty (rounded to 2 decimals)
  React.useEffect(() => {
    if (!isCrypto) return;
    const e = Number(entry) || 0;
    const x = Number(exit) || 0;
    const q = Number(qty) || 0;
    if (e > 0 && q > 0) {
      setValue("fees", round2(calculateCryptoFees(e, x, q)));
    }
  }, [isCrypto, entry, exit, qty, setValue]);

  const preview =
    entry > 0 && exit > 0 && qty > 0
      ? isCrypto
        ? calculateCryptoPnL({
            type,
            entry,
            exit,
            qty,
            fees: fees ?? 0,
            position_margin: position_margin ?? 0,
          })
        : calculatePnL({ type, entry, exit, qty, fees: fees ?? 0 })
      : null;

  const onSubmit = handleSubmit(async (values) => {
    if (!preview) return;
    setError(null);
    setSubmitting(true);
    try {
      const notesParts = [
        values.tags.trim() ? `Tags: ${values.tags.trim()}` : null,
        values.notes.trim() || null,
      ].filter(Boolean);
      const entryDate = values.entry_date?.trim();
      const payload = {
        symbol: values.symbol.trim() || "—",
        type: values.type,
        market: values.market,
        entry_price: round4(values.entry_price),
        exit_price: round4(values.exit_price),
        qty: round2(values.qty),
        fees: round2(values.fees ?? 0),
        pnl: preview.pnl,
        pnl_percent: preview.pnlPct,
        notes: notesParts.length > 0 ? notesParts.join("\n\n") : null,
        ...(entryDate ? { created_at: `${entryDate}T12:00:00.000Z` } : {}),
      };
      if (tradeToEdit) {
        await updateTrade(tradeToEdit.id, payload);
      } else {
        await insertTrade(payload);
        reset(defaultValues);
        setValue("entry_date", getTodayDateString());
        setMarginMode("percent");
        setMarginPercent(25);
        setSymbolFilter("");
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save trade");
    } finally {
      setSubmitting(false);
    }
  });

  const handleSymbolSelect = (value: string) => {
    setValue("symbol", value);
    setSymbolFilter("");
    setSymbolOpen(false);
  };

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div className="flex min-h-full flex-col items-center justify-center py-8 px-4">
        <dialog
          open
          className="relative z-10 mt-8 mb-16 flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl max-h-[calc(95vh-5rem)]"
          onCancel={() => onOpenChange(false)}
        >
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {tradeToEdit ? "Edit Trade" : "Add New Trade"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tradeToEdit ? "Update and save your changes" : "Enter the details of your trade"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={dialogContentRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-5 min-h-0">
            {/* Row 1: Symbol * | Market * */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="relative" ref={symbolListRef}>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Symbol <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Select symbol..."
                  value={symbolOpen ? symbolFilter : symbol}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSymbolFilter(v);
                    setValue("symbol", v);
                  }}
                  onFocus={() => {
                    setSymbolOpen(true);
                    setSymbolFilter(symbol);
                  }}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
                {symbolOpen && (
                  <div className="absolute top-full z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
                    {filteredSymbols.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No symbols match. You can type a custom symbol above.
                      </div>
                    ) : (
                      filteredSymbols.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSymbolSelect(opt)}
                          className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                        >
                          {opt}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Market <span className="text-destructive">*</span>
                </label>
                <select
                  {...marketField}
                  onChange={(e) => {
                    marketField.onChange(e);
                    setValue("symbol", "");
                    setSymbolFilter("");
                  }}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                >
                  <option value="crypto">Crypto</option>
                  <option value="cfd">CFD</option>
                  <option value="forex">Forex</option>
                  <option value="stocks">Stocks</option>
                </select>
              </div>
            </div>

            {/* Row 2: Type * | Leverage (crypto only) */}
            <div className={`grid gap-4 ${isCrypto ? "grid-cols-1 sm:grid-cols-2" : ""}`}>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Type <span className="text-destructive">*</span>
                </label>
                <select
                  {...register("type")}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              {isCrypto && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Leverage</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 10"
                    {...register("leverage", { valueAsNumber: true, min: 0 })}
                    className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                </div>
              )}
            </div>

            {/* Row 3: Entry Price * | Exit Price * */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Entry Price <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="e.g. 43250.1234"
                  {...register("entry_price", { valueAsNumber: true, min: 0 })}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Exit Price <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="e.g. 44890.5678"
                  {...register("exit_price", { valueAsNumber: true, min: 0 })}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
            </div>

            {/* Exit date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Exit date</label>
              <input
                type="date"
                {...register("entry_date")}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {/* Crypto: Position margin (full width), Fixed / % buttons next to textbox */}
            {isCrypto && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Position margin</label>
                <div className="flex flex-wrap items-stretch gap-2">
                  {marginMode === "fixed" ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 100"
                      {...register("position_margin", { valueAsNumber: true, min: 0 })}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  ) : (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="e.g. 25"
                        value={marginPercent || ""}
                        onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                      {totalBalance > 0 && marginPercent > 0 && (
                        <span className="flex items-center text-sm text-muted-foreground">
                          = ${round2((totalBalance * marginPercent) / 100).toFixed(2)}
                        </span>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setMarginMode("fixed")}
                    className={`shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      marginMode === "fixed"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Fixed
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarginMode("percent")}
                    className={`shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      marginMode === "percent"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
            )}

            {/* Qty | Fees */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Qty <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Quantity"
                  {...register("qty", { valueAsNumber: true, min: 0 })}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Fees</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("fees", { valueAsNumber: true, min: 0 })}
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
            </div>

            {/* $ Realized P&L */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                $ Realized Profit/Loss
              </label>
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground">
                {preview ? (
                  <>
                    <span className="font-medium">
                      ${preview.pnl >= 0 ? "+" : ""}{preview.pnl.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      ({preview.pnlPct >= 0 ? "+" : ""}{preview.pnlPct.toFixed(2)}%)
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Fill entry, exit and qty for preview.
                  </span>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Tags (comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Breakout, Momentum"
                {...register("tags")}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Notes
              </label>
              <textarea
                {...register("notes")}
                rows={3}
                placeholder="Optional notes..."
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 px-6 text-sm text-destructive">{error}</p>
          )}

          {/* Footer buttons - shrink-0 so they stay visible when scrolling */}
          <div className="shrink-0 flex justify-end gap-3 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border bg-transparent px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !preview || !symbol?.trim()}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving…" : tradeToEdit ? "Save changes" : "Add Trade"}
            </button>
          </div>
        </form>
        </dialog>
      </div>
    </div>
  );
}
