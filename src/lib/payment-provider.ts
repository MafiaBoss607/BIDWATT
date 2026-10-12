import { createHmac } from "node:crypto";
import { roundPaise } from "./pricing";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "partially_refunded"
  | "refunded"
  | "failed";

export interface CreateOrderParams {
  bookingId: string;
  amountInr: number;
  renterId: string;
  notes?: Record<string, string>;
  idempotencyKey: string;
}

export interface PaymentOrderResult {
  orderId: string;
  amountInr: number;
  currency: string;
  provider: "sandbox" | "razorpay" | "cashfree";
  status: PaymentStatus;
  checkoutPayload: Record<string, unknown>;
}

export interface CaptureParams {
  orderId: string;
  paymentId: string;
  amountInr: number;
}

export interface RefundParams {
  paymentId: string;
  amountInr: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  refundId: string;
  paymentId: string;
  amountInr: number;
  status: "processed" | "pending" | "failed";
}

export interface WebhookVerificationParams {
  rawBody: string;
  signature: string;
  secret: string;
}

/** Provider-agnostic payment interface for the Indian market */
export interface PaymentProvider {
  name: "sandbox" | "razorpay" | "cashfree";
  createOrder(params: CreateOrderParams): Promise<PaymentOrderResult>;
  verifyWebhook(params: WebhookVerificationParams): boolean;
  parseWebhookEvent(rawBody: string): { eventId: string; eventType: string; payload: any };
  capturePayment(params: CaptureParams): Promise<{ status: PaymentStatus; capturedAmountInr: number }>;
  processRefund(params: RefundParams): Promise<RefundResult>;
}

/**
 * Sandbox Payment Provider:
 * Deterministic, signature-verified, testable mock of Razorpay/Cashfree flows.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  name = "sandbox" as const;
  private secret: string;

  constructor(secret = "sandbox_secret_key_bidwatt_dev") {
    this.secret = secret;
  }

  async createOrder(params: CreateOrderParams): Promise<PaymentOrderResult> {
    const orderId = `order_sb_${params.bookingId.slice(0, 8)}_${Date.now()}`;
    return {
      orderId,
      amountInr: roundPaise(params.amountInr),
      currency: "INR",
      provider: "sandbox",
      status: "authorized",
      checkoutPayload: {
        key: "rzp_test_mock",
        amount: Math.round(roundPaise(params.amountInr) * 100), // in paise
        currency: "INR",
        order_id: orderId,
        name: "Bidwatt GPU Compute",
        description: `Booking ${params.bookingId}`,
        prefill: {
          contact: "+919876543210",
        },
      },
    };
  }

  generateSignature(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  verifyWebhook({ rawBody, signature, secret }: WebhookVerificationParams): boolean {
    const expected = createHmac("sha256", secret || this.secret)
      .update(rawBody)
      .digest("hex");
    return expected === signature;
  }

  parseWebhookEvent(rawBody: string): { eventId: string; eventType: string; payload: any } {
    const data = JSON.parse(rawBody);
    return {
      eventId: data.id ?? `evt_${Date.now()}`,
      eventType: data.event ?? "payment.captured",
      payload: data.payload ?? data,
    };
  }

  async capturePayment(params: CaptureParams): Promise<{ status: PaymentStatus; capturedAmountInr: number }> {
    return {
      status: "captured",
      capturedAmountInr: roundPaise(params.amountInr),
    };
  }

  async processRefund(params: RefundParams): Promise<RefundResult> {
    return {
      refundId: `rfnd_sb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      paymentId: params.paymentId,
      amountInr: roundPaise(params.amountInr),
      status: "processed",
    };
  }
}
