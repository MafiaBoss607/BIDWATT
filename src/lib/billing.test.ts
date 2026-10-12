import { describe, it, expect } from "vitest";
import { SandboxPaymentProvider } from "./payment-provider";
import {
  validateLedgerTransaction,
  createBookingCollectionLedger,
  createSettlementLedger,
  calculateTrustedDeliveredCharges,
  type LedgerEntry,
} from "./ledger";
import { calculatePriceBreakdown, roundPaise } from "./pricing";

describe("Billing, Ledger, and Usage Verification Suite", () => {
  const provider = new SandboxPaymentProvider("test_secret_123");

  describe("1. Payment Webhook Idempotency & Signature Verification", () => {
    it("verifies authentic webhook signature correctly", () => {
      const rawPayload = JSON.stringify({
        id: "evt_123456",
        event: "payment.captured",
        payload: { paymentId: "pay_test_99", amount: 3000 },
      });
      const validSig = provider.generateSignature(rawPayload);

      const isValid = provider.verifyWebhook({
        rawBody: rawPayload,
        signature: validSig,
        secret: "test_secret_123",
      });
      expect(isValid).toBe(true);
    });

    it("rejects tampered webhook payloads", () => {
      const rawPayload = JSON.stringify({ id: "evt_123456", amount: 3000 });
      const validSig = provider.generateSignature(rawPayload);

      const tamperedPayload = JSON.stringify({ id: "evt_123456", amount: 999999 });
      const isValid = provider.verifyWebhook({
        rawBody: tamperedPayload,
        signature: validSig,
        secret: "test_secret_123",
      });
      expect(isValid).toBe(false);
    });

    it("handles idempotent webhook event parsing", () => {
      const payload = JSON.stringify({
        id: "evt_order_confirmed_001",
        event: "order.paid",
        data: { id: "order_123" },
      });
      const parsed = provider.parseWebhookEvent(payload);
      expect(parsed.eventId).toBe("evt_order_confirmed_001");
      expect(parsed.eventType).toBe("order.paid");
    });
  });

  describe("2. Rounding & Price Calculation", () => {
    it("accurately handles fractional paise and banking rounding", () => {
      expect(roundPaise(30.004)).toBe(30.0);
      expect(roundPaise(30.005)).toBe(30.01);
      expect(roundPaise(25.496)).toBe(25.5);
    });

    it("prevents penny leak on odd commission division", () => {
      const breakdown = calculatePriceBreakdown({
        unitPriceInr: 17.77,
        billingUnit: "hour",
        durationHours: 3,
        commissionRatePct: 15,
      });
      expect(breakdown.computeTotalInr).toBe(53.31);
      expect(breakdown.platformFeeInr + breakdown.hostReceivableInr).toBe(breakdown.computeTotalInr);
    });
  });

  describe("3. Partial Usage & Undelivered Refund After Mid-Session Failure", () => {
    it("never charges renters for compute that was not delivered", () => {
      // 2 hours committed @ ₹50/hr = ₹100 committed
      // Host crashes after 30 minutes (1800 seconds)
      const usage = calculateTrustedDeliveredCharges({
        records: [{ deliveredSeconds: 1800, isVerified: true }],
        unitPriceInr: 50,
        billingUnit: "hour",
        committedHours: 2,
      });

      expect(usage.totalDeliveredSeconds).toBe(1800);
      expect(usage.deliveredHours).toBe(0.5);
      expect(usage.deliveredComputeInr).toBe(25.0); // only charged ₹25
      expect(usage.undeliveredRefundInr).toBe(75.0); // refunded ₹75
    });

    it("discards unverified usage records to prevent host manipulation", () => {
      const usage = calculateTrustedDeliveredCharges({
        records: [
          { deliveredSeconds: 1800, isVerified: true },
          { deliveredSeconds: 3600, isVerified: false }, // tampered/unverified
        ],
        unitPriceInr: 50,
        billingUnit: "hour",
        committedHours: 2,
      });

      expect(usage.totalDeliveredSeconds).toBe(1800);
      expect(usage.deliveredComputeInr).toBe(25.0);
      expect(usage.undeliveredRefundInr).toBe(75.0);
    });
  });

  describe("4. Double-Entry Ledger Always Balancing", () => {
    it("balances upfront booking collection ledger", () => {
      const entries = createBookingCollectionLedger("tx_100", "booking_100", 150.5);
      const val = validateLedgerTransaction(entries);
      expect(val.balanced).toBe(true);
      expect(val.debitTotal).toBe(150.5);
      expect(val.creditTotal).toBe(150.5);
    });

    it("balances settlement ledger with partial delivered compute & refund", () => {
      const entries = createSettlementLedger({
        transactionId: "tx_settle_200",
        bookingId: "booking_200",
        totalHeldInr: 100, // ₹100 collected upfront
        deliveredComputeInr: 40, // only ₹40 delivered
        commissionPct: 15, // 15% of 40 = ₹6.00 fee, ₹34.00 host
        gstRatePct: 18, // 18% of ₹6 = ₹1.08 GST
      });

      const val = validateLedgerTransaction(entries);
      expect(val.balanced).toBe(true);
      expect(val.difference).toBe(0);
      expect(val.debitTotal).toBe(val.creditTotal);
    });

    it("throws when unbalanced ledger entries are submitted", () => {
      const unbalanced: LedgerEntry[] = [
        {
          transactionId: "tx_err",
          account: "cash_gateway",
          entryType: "debit",
          amountInr: 100,
          description: "Err",
        },
        {
          transactionId: "tx_err",
          account: "renter_holding",
          entryType: "credit",
          amountInr: 80,
          description: "Err",
        },
      ];
      const val = validateLedgerTransaction(unbalanced);
      expect(val.balanced).toBe(false);
      expect(val.difference).toBe(20);
    });
  });
});
