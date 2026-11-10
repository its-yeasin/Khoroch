import Decimal from "decimal.js";

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export type MoneyInput =
  | string
  | number
  | Decimal
  | { toString(): string }
  | { $numberDecimal: string }
  | null
  | undefined;

export function extractMoneyRaw(value: MoneyInput): string {
  if (value === null || value === undefined || value === "") {
    return "0";
  }
  if (typeof value === "object" && "$numberDecimal" in value) {
    return String(value.$numberDecimal);
  }
  if (value instanceof Decimal) {
    return value.toString();
  }
  return String(value).trim();
}

export function toDecimal(value: MoneyInput): Decimal {
  const raw = extractMoneyRaw(value);
  try {
    const dec = new Decimal(raw);
    if (!dec.isFinite()) {
      throw new Error(`Invalid monetary amount: ${raw}`);
    }
    return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } catch {
    throw new Error(`Invalid monetary amount: ${raw}`);
  }
}

export function toMoneyString(value: MoneyInput): string {
  return toDecimal(value).toFixed(2);
}

export function toMoneyNumber(value: MoneyInput): number {
  return toDecimal(value).toNumber();
}

export function addMoney(a: MoneyInput, b: MoneyInput): string {
  return toDecimal(a).plus(toDecimal(b)).toFixed(2);
}

export function subMoney(a: MoneyInput, b: MoneyInput): string {
  return toDecimal(a).minus(toDecimal(b)).toFixed(2);
}

export function compareMoney(a: MoneyInput, b: MoneyInput): -1 | 0 | 1 {
  const cmp = toDecimal(a).comparedTo(toDecimal(b));
  if (cmp < 0) return -1;
  if (cmp > 0) return 1;
  return 0;
}

export function isPositiveMoney(value: MoneyInput): boolean {
  return toDecimal(value).gt(0);
}

export function isNonNegativeMoney(value: MoneyInput): boolean {
  return toDecimal(value).gte(0);
}

export function sumMoney(values: MoneyInput[]): string {
  let acc = new Decimal(0);
  for (const val of values) {
    acc = acc.plus(toDecimal(val));
  }
  return acc.toFixed(2);
}

export function formatMoney(
  value: MoneyInput,
  symbol = "৳",
  options?: { trimWholeDecimals?: boolean; showSign?: boolean },
): string {
  const dec = toDecimal(value);
  const isNeg = dec.isNegative();
  const absFixed = dec.abs().toFixed(2);
  const [intPart, decPart] = absFixed.split(".");

  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const showDecimals =
    options?.trimWholeDecimals && decPart === "00" ? "" : `.${decPart}`;

  const prefix = isNeg ? "-" : options?.showSign && dec.gt(0) ? "+" : "";
  return `${prefix}${symbol}${groupedInt}${showDecimals}`;
}
