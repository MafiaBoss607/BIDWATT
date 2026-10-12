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

export interface PricingBreakdownInput {
  unitPriceInr: number;
  billingUnit: "minute" | "hour" | "session";
  durationHours: number;
  storageTerms?: string;
  bandwidthTerms?: string;
  commissionRatePct?: number; // e.g. 15 for 15%
  isIdleBillable?: boolean;
}

export interface PriceBreakdown {
  unitPriceInr: number;
  billingUnit: "minute" | "hour" | "session";
  durationHours: number;
  computeTotalInr: number;
  commissionRatePct: number;
  platformFeeInr: number; // e.g. 15% of compute total
  hostReceivableInr: number; // e.g. 85% of compute total
  gstOnFeeInr: number; // 18% GST applicable on platform commission fee
  totalPayableByRenterInr: number; // computeTotal + gstOnFee
  isIdleBillable: boolean;
  failurePolicyNotice: string;
}

export const DEFAULT_COMMISSION_PCT = 15;
export const GST_RATE_ON_FEE_PCT = 18;

/** Rounds amount to standard INR paise (2 decimal places). */
export function roundPaise(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates a complete, transparent price breakdown before commitment.
 * Example: ₹30/hour for 1 hr -> Host receives ₹25.50, Platform commission ₹4.50.
 * Renters are never charged for undelivered time on session failure.
 */
export function calculatePriceBreakdown(input: PricingBreakdownInput): PriceBreakdown {
  if (input.unitPriceInr < 0) throw new Error("Unit price cannot be negative");
  if (input.durationHours <= 0) throw new Error("Duration must be positive");

  const commissionRatePct = input.commissionRatePct ?? DEFAULT_COMMISSION_PCT;
  if (commissionRatePct < 0 || commissionRatePct > 100) {
    throw new Error("Commission rate must be between 0 and 100%");
  }

  let computeTotal = 0;
  if (input.billingUnit === "hour") {
    computeTotal = input.unitPriceInr * input.durationHours;
  } else if (input.billingUnit === "minute") {
    computeTotal = input.unitPriceInr * (input.durationHours * 60);
  } else {
    // 'session'
    computeTotal = input.unitPriceInr;
  }
  computeTotal = roundPaise(computeTotal);

  const platformFeeInr = roundPaise((computeTotal * commissionRatePct) / 100);
  // Ensure hostReceivable + platformFee exactly equals computeTotal (no penny leak)
  const hostReceivableInr = roundPaise(computeTotal - platformFeeInr);

  const gstOnFeeInr = roundPaise((platformFeeInr * GST_RATE_ON_FEE_PCT) / 100);
  const totalPayableByRenterInr = roundPaise(computeTotal + gstOnFeeInr);

  const isIdleBillable = input.isIdleBillable ?? false;

  const failurePolicyNotice =
    "Undelivered service guarantee: If the host goes offline or fails mid-session, you are automatically refunded for all undelivered compute time to the exact second. Idle time is " +
    (isIdleBillable ? "billable while resources are allocated." : "not billable.");

  return {
    unitPriceInr: input.unitPriceInr,
    billingUnit: input.billingUnit,
    durationHours: input.durationHours,
    computeTotalInr: computeTotal,
    commissionRatePct,
    platformFeeInr,
    hostReceivableInr,
    gstOnFeeInr,
    totalPayableByRenterInr,
    isIdleBillable,
    failurePolicyNotice,
  };
}

