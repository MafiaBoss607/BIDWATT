import { describe, expect, it } from "vitest";
import { rankHosts, reliability } from "./matching";

const req = { min_vram_gb: 8, duration_hours: 3, budget_inr: 50, budget_max_inr: null, runtime: "" };
const dev = (id: string, o: Partial<Parameters<typeof rankHosts>[1][number]> = {}) => ({
  id, host_id: "h" + id, gpu_model: "GPU", vram_gb: 12, benchmark_score: 100, hourly_rate_inr: 15, runtimes: [], available: true, ...o,
});

describe("host matching", () => {
  it("excludes devices below the VRAM minimum", () => {
    expect(rankHosts(req, [dev("a", { vram_gb: 6 })])).toHaveLength(0);
  });
  it("does not rank on price alone: a faster, reliable host can beat a cheaper one", () => {
    const cheapSlow = dev("a", { hourly_rate_inr: 10, benchmark_score: 20 });
    const fair = dev("b", { hourly_rate_inr: 16, benchmark_score: 100 });
    const r = rankHosts(req, [cheapSlow, fair], { hb: { completed: 10, failed: 0 } });
    expect(r[0].device.id).toBe("b");
  });
  it("estimates the total from the hourly rate (₹15 × 3h = ₹45)", () => {
    expect(rankHosts(req, [dev("a")])[0].est_total_inr).toBe(45);
  });
  it("gives new hosts a neutral reliability of 0.5", () => {
    expect(reliability()).toBe(0.5);
  });
});
