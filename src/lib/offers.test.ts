import { describe, expect, it } from "vitest";
import {
  attachmentError,
  canRespondToOffer,
  displayStatus,
  estimateTotal,
  validateBlockedInteraction,
  validateOfferImmutability,
  type OfferData,
} from "./offers";

const mockOffer: OfferData = {
  id: "off-1",
  conversation_id: "conv-1",
  proposer_id: "host-1",
  recipient_id: "renter-1",
  supersedes_id: null,
  gpu_model: "RTX 4090",
  min_specs: "24GB VRAM",
  vram_gb: 24,
  start_at: new Date(Date.now() + 3600000).toISOString(),
  duration_hours: 2,
  billing_unit: "hour",
  unit_price_inr: 40,
  est_total_inr: 80,
  runtime: "PyTorch",
  interruption_allowed: false,
  storage_terms: "50GB",
  bandwidth_terms: "100Mbps",
  cancellation_terms: "Full refund before start",
  expires_at: new Date(Date.now() + 1800000).toISOString(),
  status: "pending",
  created_at: new Date().toISOString(),
};

describe("offers", () => {
  it("per-minute billing: ₹0.30/min × 2h = ₹36", () => expect(estimateTotal("minute", 0.3, 2)).toBe(36));
  it("per-session billing ignores duration", () => expect(estimateTotal("session", 50, 3)).toBe(50));
  it("pending offer past expiry displays as expired", () =>
    expect(displayStatus({ status: "pending", expires_at: new Date(1000).toISOString() }, 2000)).toBe("expired"));
  it("accepted offer stays accepted after expiry", () =>
    expect(displayStatus({ status: "accepted", expires_at: new Date(1000).toISOString() }, 2000)).toBe("accepted"));
  it("rejects attachments over 5 MB", () =>
    expect(attachmentError({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).not.toBeNull());
  it("rejects executable attachments", () =>
    expect(attachmentError({ type: "application/x-msdownload", size: 10 })).not.toBeNull());

  // Task 2 requirements:
  // 1. Two simultaneous accepts on one offer: atomic simulation where only first accept succeeds
  it("handles simultaneous accepts: only the first accept succeeds, second is rejected because offer is no longer pending", () => {
    let currentOfferState: OfferData = { ...mockOffer };
    let acceptedBookingsCount = 0;

    const performAccept = (userId: string) => {
      const check = canRespondToOffer(currentOfferState, userId);
      if (!check.allowed) return { error: check.error };
      // Atomic transition
      currentOfferState = { ...currentOfferState, status: "accepted" };
      acceptedBookingsCount++;
      return { success: true };
    };

    const res1 = performAccept("renter-1");
    const res2 = performAccept("renter-1");

    expect(res1.success).toBe(true);
    expect(res2.error).toMatch(/already accepted/i);
    expect(acceptedBookingsCount).toBe(1);
  });

  // 2. Offer expiry test
  it("rejects attempts to accept an expired offer", () => {
    const expiredOffer: OfferData = {
      ...mockOffer,
      expires_at: new Date(Date.now() - 10000).toISOString(),
    };
    const res = canRespondToOffer(expiredOffer, "renter-1");
    expect(res.allowed).toBe(false);
    expect(res.error).toMatch(/expired/i);
  });

  // 3. Proposer cannot accept their own offer
  it("proposer cannot accept their own offer", () => {
    const res = canRespondToOffer(mockOffer, "host-1");
    expect(res.allowed).toBe(false);
    expect(res.error).toMatch(/recipient/i);
  });

  // 4. Attempts to alter accepted terms
  it("prohibits altering agreed offer terms (immutability)", () => {
    const acceptedOffer: OfferData = { ...mockOffer, status: "accepted" };
    const attemptAlteredPrice = validateOfferImmutability(acceptedOffer, {
      unit_price_inr: 10,
    });
    expect(attemptAlteredPrice.allowed).toBe(false);
    expect(attemptAlteredPrice.error).toMatch(/immutable/i);

    const attemptAlteredDuration = validateOfferImmutability(acceptedOffer, {
      duration_hours: 5,
    });
    expect(attemptAlteredDuration.allowed).toBe(false);
    expect(attemptAlteredDuration.error).toMatch(/immutable/i);
  });

  // 5. Blocked users
  it("blocks interactions between blocked users in both directions", () => {
    const blocks = [{ blocker_id: "userA", blocked_id: "userB" }];
    const aToB = validateBlockedInteraction("userA", "userB", blocks);
    const bToA = validateBlockedInteraction("userB", "userA", blocks);
    const cToA = validateBlockedInteraction("userC", "userA", blocks);

    expect(aToB.allowed).toBe(false);
    expect(aToB.error).toMatch(/cannot contact/i);
    expect(bToA.allowed).toBe(false);
    expect(bToA.error).toMatch(/cannot contact/i);
    expect(cToA.allowed).toBe(true);
  });
});
