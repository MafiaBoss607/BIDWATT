import { describe, expect, it } from "vitest";
import {
  BOOKING_TRANSITIONS,
  validateBookingTransition,
  type BookingState,
} from "./booking-state";

describe("booking state transitions", () => {
  it("includes all 11 explicit states from the brief", () => {
    const allStates: BookingState[] = [
      "OFFER_PENDING",
      "BOOKING_CONFIRMED",
      "HOST_PREPARING",
      "READY_TO_START",
      "RUNNING",
      "COMPLETED",
      "CANCELLED",
      "FAILED",
      "REFUND_PENDING",
      "REFUNDED",
      "DISPUTED",
    ];
    const presentInRules = new Set<string>();
    BOOKING_TRANSITIONS.forEach((t) => {
      presentInRules.add(t.from);
      presentInRules.add(t.to);
    });
    for (const state of allStates) {
      expect(presentInRules.has(state)).toBe(true);
    }
  });

  it("permits legal progression: CONFIRMED -> HOST_PREPARING by host", () => {
    const res = validateBookingTransition("BOOKING_CONFIRMED", "HOST_PREPARING", "host");
    expect(res.valid).toBe(true);
  });

  it("permits legal progression: HOST_PREPARING -> READY_TO_START by host", () => {
    const res = validateBookingTransition("HOST_PREPARING", "READY_TO_START", "host");
    expect(res.valid).toBe(true);
  });

  it("permits legal progression: READY_TO_START -> RUNNING by renter", () => {
    const res = validateBookingTransition("READY_TO_START", "RUNNING", "renter");
    expect(res.valid).toBe(true);
  });

  it("permits legal progression: RUNNING -> COMPLETED by either", () => {
    expect(validateBookingTransition("RUNNING", "COMPLETED", "host").valid).toBe(true);
    expect(validateBookingTransition("RUNNING", "COMPLETED", "renter").valid).toBe(true);
  });

  it("rejects illegal state transition: skipping straight from BOOKING_CONFIRMED to RUNNING", () => {
    const res = validateBookingTransition("BOOKING_CONFIRMED", "RUNNING", "host");
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/illegal transition/i);
  });

  it("rejects illegal actor: renter cannot move BOOKING_CONFIRMED -> HOST_PREPARING", () => {
    const res = validateBookingTransition("BOOKING_CONFIRMED", "HOST_PREPARING", "renter");
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/only the host/i);
  });

  it("rejects illegal actor: host cannot move READY_TO_START -> RUNNING", () => {
    const res = validateBookingTransition("READY_TO_START", "RUNNING", "host");
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/only the renter/i);
  });

  it("permits dispute and refund paths: RUNNING -> DISPUTED -> REFUND_PENDING -> REFUNDED", () => {
    expect(validateBookingTransition("RUNNING", "DISPUTED", "renter").valid).toBe(true);
    expect(validateBookingTransition("DISPUTED", "REFUND_PENDING", "host").valid).toBe(true);
    expect(validateBookingTransition("REFUND_PENDING", "REFUNDED", "host").valid).toBe(true);
  });
});
