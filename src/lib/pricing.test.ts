import { describe, it, expect } from "vitest";
import { hourlyRate, validateRequest } from "./pricing";

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
  it("rejects VRAM above 192 GB", () => {
    expect(validateRequest({ ...base, min_vram_gb: 200 })).not.toBeNull();
  });
});
