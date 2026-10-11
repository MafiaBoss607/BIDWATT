export type MatchRequest = { min_vram_gb: number; duration_hours: number; budget_inr: number; budget_max_inr: number | null; runtime: string };
export type MatchDevice = {
  id: string; host_id: string; gpu_model: string; vram_gb: number; benchmark_score: number;
  hourly_rate_inr: number; runtimes: string[]; available: boolean;
};
export type HostStats = { completed: number; failed: number };

export const WEIGHTS = { fit: 0.25, performance: 0.2, cost: 0.25, availability: 0.15, reliability: 0.15 };

/** Reliability with a neutral prior so new hosts aren't punished or boosted: (completed+1)/(total+2). */
export function reliability(s?: HostStats): number {
  const c = s?.completed ?? 0, f = s?.failed ?? 0;
  return (c + 1) / (c + f + 2);
}

/** Ranks compatible devices. Devices below the VRAM minimum are excluded entirely. */
export function rankHosts(req: MatchRequest, devices: MatchDevice[], stats: Record<string, HostStats> = {}) {
  const compatible = devices.filter((d) => d.vram_gb >= req.min_vram_gb);
  const maxBench = Math.max(1, ...compatible.map((d) => d.benchmark_score));
  const ceiling = req.budget_max_inr ?? req.budget_inr;
  return compatible
    .map((d) => {
      const est = Math.round(Number(d.hourly_rate_inr) * Number(req.duration_hours) * 100) / 100;
      const runtimeOk = !req.runtime || d.runtimes.some((r) => r.toLowerCase().includes(req.runtime.toLowerCase()));
      const parts = {
        fit: (runtimeOk ? 0.6 : 0.2) + 0.4 * Math.min(1, req.min_vram_gb / d.vram_gb),
        performance: d.benchmark_score / maxBench,
        cost: est <= 0 ? 0 : Math.min(1, ceiling / est),
        availability: d.available ? 1 : 0.2,
        reliability: reliability(stats[d.host_id]),
      };
      const score = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((s, k) => s + WEIGHTS[k] * parts[k], 0);
      return { device: d, est_total_inr: est, within_budget: est <= ceiling, parts, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score);
}
