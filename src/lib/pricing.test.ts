import { describe, it, expect } from "vitest";
import { hourlyRate, validateRequest, calculatePriceBreakdown } from "./pricing";

const base = { title: "Fine-tune a small model", min_vram_gb: 8, duration_hours: 3, budget_inr: 50 };

describe("pricing", () => {
  it("computes hourly rate from total budget", () => {
    expect(hourlyRate(50, 3)).toBe(16.67);
  });
  it("rejects zero duration", () => {
    expect(() => hourlyRate(50, 0)).toThrow();
  });
  it("accepts the brief's example request", () => {
    expect(validateRequest(base)).toBeNull();
  });
  it("rejects non-integer rupee budgets", () => {
    expect(validateRequest({ ...base, budget_inr: 49.5 })).not.toBeNull();
  });
  it("computes 15% platform commission example from prompt correctly (₹30/hr -> ₹25.50 host, ₹4.50 platform)", () => {
    const result = calculatePriceBreakdown({
      unitPriceInr: 30,
      billingUnit: "hour",
      durationHours: 1,
      commissionRatePct: 15,
    });
    expect(result.computeTotalInr).toBe(30.0);
    expect(result.platformFeeInr).toBe(4.5);
    expect(result.hostReceivableInr).toBe(25.5);
    expect(result.gstOnFeeInr).toBe(0.81); // 18% of 4.50
    expect(result.totalPayableByRenterInr).toBe(30.81);
  });

  it("ensures host receivable + platform fee precisely equals compute total with odd decimals", () => {
    const result = calculatePriceBreakdown({
      unitPriceInr: 33.33,
      billingUnit: "hour",
      durationHours: 3.5,
      commissionRatePct: 15,
    });
    expect(result.computeTotalInr).toBe(116.66);
    expect(result.platformFeeInr + result.hostReceivableInr).toBe(result.computeTotalInr);
  });
});

