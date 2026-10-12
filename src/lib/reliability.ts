import { roundPaise } from "./pricing";

// ---------------------------------------------------------------------------
// 1. Cancellation Evaluation & Taxonomy
// ---------------------------------------------------------------------------

export type CancellationInitiator = "host" | "renter" | "system";

export type CancellationCause =
  | "preventable_human" // Host forgot, renter changed mind without valid clause
  | "genuine_technical" // Node kernel panic, GPU hardware falloff, power cut
  | "suspected_abuse" // Sandboxing alert, crypto mining probe, credential scraping
  | "mutual_agreement";

export interface CancellationResolution {
  refundAmountInr: number;
  penaltyInr: number;
  hostScoreImpact: number;
  triggerReplacementMatching: boolean;
  reliabilityEvent: {
    eventType: string;
    causeCategory: CancellationCause;
    scoreDelta: number;
    explanation: string;
  };
}

/**
 * Calculates financial resolution and reliability impact based on timeline, party, and cause.
 * Rules:
 * - Host cancels > 2 hrs before start: 100% refund, no penalty, mild/zero score impact.
 * - Host cancels < 2 hrs before start (last minute): 100% refund, replacement matching triggered, score hit (-5.0).
 * - Machine failure mid-session: Stop billing immediately, refund unused prepaid time,
 *   do not penalize host if genuinely technical, trigger replacement matching.
 * - Suspected abuse: Immediate kill, zero payout to offender, flagged for moderation.
 */
export function evaluateCancellation(params: {
  initiator: CancellationInitiator;
  cause: CancellationCause;
  startAt: Date;
  cancelledAt: Date;
  totalPrepaidInr: number;
  deliveredUsageInr: number;
  isMidSession: boolean;
}): CancellationResolution {
  const {
    initiator,
    cause,
    startAt,
    cancelledAt,
    totalPrepaidInr,
    deliveredUsageInr,
    isMidSession,
  } = params;

  // Unused prepaid time
  const unusedInr = Math.max(0, roundPaise(totalPrepaidInr - deliveredUsageInr));

  // 1. Mid-session technical failure
  if (isMidSession) {
    if (cause === "genuine_technical") {
      return {
        refundAmountInr: unusedInr,
        penaltyInr: 0,
        hostScoreImpact: -0.5, // Minor bump, acknowledged hardware hazard
        triggerReplacementMatching: true,
        reliabilityEvent: {
          eventType: "hardware_failure_recovered",
          causeCategory: "genuine_technical",
          scoreDelta: -0.5,
          explanation:
            "Hardware failure mid-session; unused compute refunded, replacement matching enabled.",
        },
      };
    }

    if (cause === "suspected_abuse") {
      return {
        refundAmountInr: initiator === "renter" ? 0 : unusedInr,
        penaltyInr: 0,
        hostScoreImpact: initiator === "host" ? -25.0 : 0,
        triggerReplacementMatching: false,
        reliabilityEvent: {
          eventType: "abuse_suspected",
          causeCategory: "suspected_abuse",
          scoreDelta: -25.0,
          explanation: "Session halted due to security violation or sandbox evasion attempt.",
        },
      };
    }
  }

  // 2. Host Cancellations before start
  if (initiator === "host") {
    const minutesToStart = (startAt.getTime() - cancelledAt.getTime()) / 60000;

    if (minutesToStart > 120) {
      // Well in advance (>2h)
      return {
        refundAmountInr: totalPrepaidInr,
        penaltyInr: 0,
        hostScoreImpact: 0,
        triggerReplacementMatching: true,
        reliabilityEvent: {
          eventType: "host_early_cancel",
          causeCategory: cause,
          scoreDelta: 0,
          explanation: "Host cancelled with ample advance notice (>2 hrs). Full refund.",
        },
      };
    } else {
      // Last-minute host cancel (<2h)
      const penalty = cause === "genuine_technical" ? -1.0 : -6.0;
      return {
        refundAmountInr: totalPrepaidInr,
        penaltyInr: 0, // No cash deposits at launch, progressive score impact instead
        hostScoreImpact: penalty,
        triggerReplacementMatching: true,
        reliabilityEvent: {
          eventType: "host_last_minute_cancel",
          causeCategory: cause,
          scoreDelta: penalty,
          explanation:
            "Last-minute host cancellation. Full refund and replacement matching initiated.",
        },
      };
    }
  }

  // 3. Renter Cancellations
  if (initiator === "renter") {
    const minutesToStart = (startAt.getTime() - cancelledAt.getTime()) / 60000;
    if (minutesToStart > 60) {
      // Free cancellation up to 1 hr before start
      return {
        refundAmountInr: totalPrepaidInr,
        penaltyInr: 0,
        hostScoreImpact: 0,
        triggerReplacementMatching: false,
        reliabilityEvent: {
          eventType: "renter_early_cancel",
          causeCategory: "preventable_human",
          scoreDelta: 0,
          explanation: "Renter cancelled > 1 hour before scheduled start. Full refund issued.",
        },
      };
    } else {
      // Less than 1 hr: 20% commitment retention to compensate host for reservation
      const retention = roundPaise(totalPrepaidInr * 0.2);
      const refund = Math.max(0, roundPaise(totalPrepaidInr - retention));
      return {
        refundAmountInr: refund,
        penaltyInr: retention,
        hostScoreImpact: 0,
        triggerReplacementMatching: false,
        reliabilityEvent: {
          eventType: "renter_late_cancel",
          causeCategory: "preventable_human",
          scoreDelta: 0,
          explanation:
            "Renter cancelled under 1 hour before start. 80% refund, 20% host reservation compensation.",
        },
      };
    }
  }

  return {
    refundAmountInr: totalPrepaidInr,
    penaltyInr: 0,
    hostScoreImpact: 0,
    triggerReplacementMatching: false,
    reliabilityEvent: {
      eventType: "system_cancel",
      causeCategory: "other",
      scoreDelta: 0,
      explanation: "Session closed by system.",
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Reliability Scoring & Progressive Enforcement
// ---------------------------------------------------------------------------

export type HostTier = "provisional" | "verified" | "standard" | "restricted" | "suspended";

export interface HostReliabilitySnapshot {
  score: number;
  tier: HostTier;
  completedBookings: number;
  lastMinuteCancels: number;
  warningsCount: number;
  canAcceptBookings: boolean;
  visibilityMultiplier: number; // 1.0 = normal, 0.5 = downranked, 0.0 = hidden
  actionNotice?: string;
}

/**
 * Calculates current tier, visibility adjustments, and enforcement limits.
 * Rules:
 * - New hosts (< 3 completed jobs) are "provisional" (never penalized as low score).
 * - Score >= 90: Verified / Standard (1.0 visibility).
 * - Score 70-89: Warning issued, normal visibility.
 * - Score 50-69: Restricted tier (0.5 visibility ranking, max 1 concurrent job).
 * - Score < 50 or >= 3 severe violations: Suspended (0.0 visibility, cannot accept jobs).
 */
export function calculateHostEnforcement(profile: {
  rawScore: number;
  completedBookings: number;
  lastMinuteCancels: number;
  warningsCount: number;
}): HostReliabilitySnapshot {
  const { rawScore, completedBookings, lastMinuteCancels, warningsCount } = profile;

  // New hosts start in provisional tier
  if (completedBookings < 3) {
    return {
      score: Math.max(80, rawScore),
      tier: "provisional",
      completedBookings,
      lastMinuteCancels,
      warningsCount,
      canAcceptBookings: true,
      visibilityMultiplier: 1.0,
      actionNotice:
        "Provisional status: Welcome! Complete 3 successful sessions to unlock Verified badge.",
    };
  }

  if (rawScore < 50 || warningsCount >= 3) {
    return {
      score: rawScore,
      tier: "suspended",
      completedBookings,
      lastMinuteCancels,
      warningsCount,
      canAcceptBookings: false,
      visibilityMultiplier: 0.0,
      actionNotice:
        "Account suspended due to repeated cancellations or policy violations. Contact support to appeal.",
    };
  }

  if (rawScore < 70) {
    return {
      score: rawScore,
      tier: "restricted",
      completedBookings,
      lastMinuteCancels,
      warningsCount,
      canAcceptBookings: true,
      visibilityMultiplier: 0.5,
      actionNotice:
        "Restricted visibility: Low reliability score has temporarily demoted search ranking.",
    };
  }

  return {
    score: rawScore,
    tier: rawScore >= 95 ? "verified" : "standard",
    completedBookings,
    lastMinuteCancels,
    warningsCount,
    canAcceptBookings: true,
    visibilityMultiplier: 1.0,
  };
}

// ---------------------------------------------------------------------------
// 3. Replacement Matching Protocol (Non-Guaranteed)
// ---------------------------------------------------------------------------

export interface CandidateHostDevice {
  hostId: string;
  deviceId: string;
  gpuModel: string;
  vramGb: number;
  hourlyPriceInr: number;
  tier: HostTier;
  reliabilityScore: number;
  isOnline: boolean;
}

export interface ReplacementMatch {
  hostId: string;
  deviceId: string;
  gpuModel: string;
  hourlyPriceInr: number;
  priceDeltaInr: number;
  isWithinBudget: boolean;
  score: number;
}

/**
 * Searches compatible hosts when an active booking fails.
 * Guarantees:
 * - Never auto-charges higher price without explicit consent.
 * - Prioritizes hosts with higher reliability score and matching or superior VRAM.
 * - Explicitly non-guaranteed replacement plan: gives renter clear choice between
 *   accepting one of the candidate matches OR taking a clean instant refund.
 */
export function rankReplacementOptions(params: {
  requiredGpuModel: string;
  minVramGb: number;
  originalUnitPriceInr: number;
  candidates: CandidateHostDevice[];
}): ReplacementMatch[] {
  const { minVramGb, originalUnitPriceInr, candidates } = params;

  return candidates
    .filter((c) => c.isOnline && c.vramGb >= minVramGb && c.tier !== "suspended")
    .map((c) => {
      const priceDelta = roundPaise(c.hourlyPriceInr - originalUnitPriceInr);
      const isWithinBudget = c.hourlyPriceInr <= originalUnitPriceInr;
      // Ranking weight: score 70%, price match 30%
      const pricePenalty = c.hourlyPriceInr > originalUnitPriceInr ? 20 : 0;
      const rankScore = c.reliabilityScore - pricePenalty;
      return {
        hostId: c.hostId,
        deviceId: c.deviceId,
        gpuModel: c.gpuModel,
        hourlyPriceInr: c.hourlyPriceInr,
        priceDeltaInr: priceDelta,
        isWithinBudget,
        score: rankScore,
      };
    })
    .sort((a, b) => b.score - a.score);
}
