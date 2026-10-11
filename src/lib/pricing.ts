export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** Effective hourly rate implied by a total budget, rounded to paise. */
export function hourlyRate(totalInr: number, hours: number): number {
  if (!(hours > 0)) throw new Error("Duration must be positive");
  return Math.round((totalInr / hours) * 100) / 100;
}

export type RequestInput = {
  title: string;
  min_vram_gb: number;
  duration_hours: number;
  budget_inr: number;
};

/** Mirrors the database limits so users get errors before submitting. */
export function validateRequest(r: RequestInput): string | null {
  if (r.title.trim().length < 3 || r.title.trim().length > 120) return "Title must be 3–120 characters.";
  if (!Number.isInteger(r.min_vram_gb) || r.min_vram_gb < 1 || r.min_vram_gb > 192) return "VRAM must be 1–192 GB.";
  if (!(r.duration_hours > 0) || r.duration_hours > 720) return "Duration must be between 0 and 720 hours.";
  if (!Number.isInteger(r.budget_inr) || r.budget_inr < 1) return "Budget must be a whole rupee amount of at least ₹1.";
  return null;
}
