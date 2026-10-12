import { describe, it, expect } from "vitest";
import {
  evaluateCancellation,
  calculateHostEnforcement,
  rankReplacementOptions,
  type CandidateHostDevice,
} from "./reliability";
import { checkRateLimit, recordSecurityAudit } from "./security";

describe("Item 1: Cancellation Handling & Taxonomy", () => {
  const startAt = new Date("2026-10-13T10:00:00Z");

  it("handles host cancelling well in advance (>2h) with 100% refund and 0 score penalty", () => {
    const cancelledAt = new Date("2026-10-13T07:00:00Z"); // 3h before
    const res = evaluateCancellation({
      initiator: "host",
      cause: "preventable_human",
      startAt,
      cancelledAt,
      totalPrepaidInr: 500,
      deliveredUsageInr: 0,
      isMidSession: false,
    });

    expect(res.refundAmountInr).toBe(500);
    expect(res.hostScoreImpact).toBe(0);
    expect(res.triggerReplacementMatching).toBe(true);
    expect(res.reliabilityEvent.eventType).toBe("host_early_cancel");
  });

  it("penalizes host for last-minute cancel (<2h) with replacement trigger and reliability drop", () => {
    const cancelledAt = new Date("2026-10-13T09:30:00Z"); // 30m before
    const res = evaluateCancellation({
      initiator: "host",
      cause: "preventable_human",
      startAt,
      cancelledAt,
      totalPrepaidInr: 500,
      deliveredUsageInr: 0,
      isMidSession: false,
    });

    expect(res.refundAmountInr).toBe(500);
    expect(res.hostScoreImpact).toBe(-6.0);
    expect(res.triggerReplacementMatching).toBe(true);
    expect(res.reliabilityEvent.eventType).toBe("host_last_minute_cancel");
  });

  it("distinguishes genuine technical failure mid-session by stopping billing and refunding unused balance", () => {
    const now = new Date("2026-10-13T11:00:00Z");
    const res = evaluateCancellation({
      initiator: "system",
      cause: "genuine_technical",
      startAt,
      cancelledAt: now,
      totalPrepaidInr: 1000,
      deliveredUsageInr: 400, // 400 utilized before node failure
      isMidSession: true,
    });

    expect(res.refundAmountInr).toBe(600); // 1000 - 400
    expect(res.hostScoreImpact).toBe(-0.5); // Minor hardware hazard penalty, not harsh
    expect(res.triggerReplacementMatching).toBe(true);
  });

  it("halts immediately on suspected abuse without refunding offending party", () => {
    const now = new Date("2026-10-13T10:30:00Z");
    const res = evaluateCancellation({
      initiator: "renter",
      cause: "suspected_abuse",
      startAt,
      cancelledAt: now,
      totalPrepaidInr: 800,
      deliveredUsageInr: 200,
      isMidSession: true,
    });

    expect(res.refundAmountInr).toBe(0); // Forfeited due to abuse
    expect(res.triggerReplacementMatching).toBe(false);
    expect(res.reliabilityEvent.causeCategory).toBe("suspected_abuse");
  });
});

describe("Item 2: Replacement Matching (Non-Guaranteed)", () => {
  const candidates: CandidateHostDevice[] = [
    {
      hostId: "h1",
      deviceId: "d1",
      gpuModel: "RTX 4090",
      vramGb: 24,
      hourlyPriceInr: 45,
      tier: "verified",
      reliabilityScore: 98,
      isOnline: true,
    },
    {
      hostId: "h2",
      deviceId: "d2",
      gpuModel: "RTX 4090",
      vramGb: 24,
      hourlyPriceInr: 60,
      tier: "standard",
      reliabilityScore: 92,
      isOnline: true,
    },
    {
      hostId: "h3",
      deviceId: "d3",
      gpuModel: "RTX 4090",
      vramGb: 24,
      hourlyPriceInr: 40,
      tier: "suspended", // should be excluded
      reliabilityScore: 40,
      isOnline: true,
    },
    {
      hostId: "h4",
      deviceId: "d4",
      gpuModel: "RTX 3080",
      vramGb: 10, // insufficient vram
      hourlyPriceInr: 25,
      tier: "standard",
      reliabilityScore: 95,
      isOnline: true,
    },
  ];

  it("ranks candidates by score and pricing while filtering out ineligible hosts", () => {
    const ranked = rankReplacementOptions({
      requiredGpuModel: "RTX 4090",
      minVramGb: 24,
      originalUnitPriceInr: 50,
      candidates,
    });

    expect(ranked).toHaveLength(2); // h1 and h2
    expect(ranked[0]?.hostId).toBe("h1");
    expect(ranked[0]?.isWithinBudget).toBe(true);
    expect(ranked[1]?.hostId).toBe("h2");
    expect(ranked[1]?.isWithinBudget).toBe(false); // ₹60 > ₹50
  });
});

describe("Item 3: Progressive Reliability Enforcement", () => {
  it("keeps new hosts (< 3 jobs) in provisional tier without harsh penalties", () => {
    const snapshot = calculateHostEnforcement({
      rawScore: 75,
      completedBookings: 1,
      lastMinuteCancels: 0,
      warningsCount: 0,
    });

    expect(snapshot.tier).toBe("provisional");
    expect(snapshot.canAcceptBookings).toBe(true);
    expect(snapshot.visibilityMultiplier).toBe(1.0);
  });

  it("demotes low scoring host to restricted tier with reduced visibility", () => {
    const snapshot = calculateHostEnforcement({
      rawScore: 65,
      completedBookings: 10,
      lastMinuteCancels: 3,
      warningsCount: 1,
    });

    expect(snapshot.tier).toBe("restricted");
    expect(snapshot.visibilityMultiplier).toBe(0.5);
    expect(snapshot.canAcceptBookings).toBe(true);
  });

  it("suspends hosts who accumulate repeated violations or drop below 50 score", () => {
    const snapshot = calculateHostEnforcement({
      rawScore: 45,
      completedBookings: 10,
      lastMinuteCancels: 5,
      warningsCount: 3,
    });

    expect(snapshot.tier).toBe("suspended");
    expect(snapshot.canAcceptBookings).toBe(false);
    expect(snapshot.visibilityMultiplier).toBe(0.0);
  });
});

describe("Item 5: Security Hardening (Rate Limiting & Privacy-Preserving Logging)", () => {
  it("enforces token bucket rate limits across requests", () => {
    const key = "ip_192.168.1.100";
    const cfg = { maxTokens: 2, refillRatePerSec: 0 }; // no refill for test

    const first = checkRateLimit(key, cfg);
    expect(first.allowed).toBe(true);

    const second = checkRateLimit(key, cfg);
    expect(second.allowed).toBe(true);

    const third = checkRateLimit(key, cfg);
    expect(third.allowed).toBe(false);
  });

  it("strips user PII and masks IP addresses in audit logs", () => {
    const log = recordSecurityAudit({
      action: "job_dispatch_failed",
      userId: "user-secret-uuid-1234",
      ipAddress: "103.21.244.15",
      bookingId: "bkg_001",
    });

    expect(log.anonymizedActorId).toMatch(/^usr_[a-f0-9]{12}$/);
    expect(log.anonymizedActorId).not.toContain("user-secret-uuid-1234");
    expect(log.maskedIp).toBe("103.21.xxx.xxx");
  });
});
