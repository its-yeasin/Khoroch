import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  formatMoney,
  isNonNegativeMoney,
  isPositiveMoney,
  subMoney,
  sumMoney,
  toMoneyString,
} from "@/lib/money";

describe("Decimal-safe monetary arithmetic", () => {
  it("avoids floating-point precision drift on 0.1 + 0.2", () => {
    expect(addMoney("0.1", "0.2")).toBe("0.30");
    expect(subMoney("0.30", "0.10")).toBe("0.20");
    expect(sumMoney(["0.1", "0.2", "0.7"])).toBe("1.00");
  });

  it("handles large monetary amounts accurately", () => {
    const sum = addMoney("9999999999.99", "0.01");
    expect(sum).toBe("10000000000.00");
    expect(formatMoney(sum, "৳")).toBe("৳10,000,000,000.00");
  });

  it("compares, validates positivity, and formats cleanly", () => {
    expect(compareMoney("100.50", "100.5")).toBe(0);
    expect(compareMoney("99.99", "100.00")).toBe(-1);
    expect(compareMoney("100.01", "100.00")).toBe(1);
    expect(isPositiveMoney("0.01")).toBe(true);
    expect(isPositiveMoney("0.00")).toBe(false);
    expect(isNonNegativeMoney("0.00")).toBe(true);
    expect(isNonNegativeMoney("-0.01")).toBe(false);
    expect(toMoneyString({ $numberDecimal: "1250.5" })).toBe("1250.50");
    expect(formatMoney("1250.00", "৳", { trimWholeDecimals: true })).toBe(
      "৳1,250",
    );
  });
});
