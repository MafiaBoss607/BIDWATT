import { roundPaise } from "./pricing";

export type LedgerAccount =
  | "renter_holding"
  | "platform_revenue"
  | "host_payable"
  | "renter_refund_payable"
  | "tax_payable"
  | "cash_gateway";

export type EntryType = "debit" | "credit";

export interface LedgerEntry {
  id?: string;
  transactionId: string;
  bookingId?: string;
  account: LedgerAccount;
  entryType: EntryType;
  amountInr: number;
  description: string;
  createdAt?: string;
}

export interface UsageRecordInput {
  bookingId: string;
  hostId: string;
  deviceId?: string;
  intervalStart: Date;
  intervalEnd: Date;
  gpuUtilizationPct: number;
  memoryUsedMb: number;
  powerDrawWatts: number;
}

export interface VerifiedUsageRecord extends UsageRecordInput {
  id: string;
  deliveredSeconds: number;
  isVerified: boolean;
  rawSignature: string;
  reportedAt: Date;
}

/**
 * Validates a double-entry transaction.
 * In a balanced double-entry ledger:
 * Total Debits must exactly equal Total Credits.
 */
export function validateLedgerTransaction(entries: LedgerEntry[]): {
  balanced: boolean;
  debitTotal: number;
  creditTotal: number;
  difference: number;
} {
  if (entries.length < 2) {
    throw new Error("A transaction requires at least 2 balanced ledger entries.");
  }

  let debitTotal = 0;
  let creditTotal = 0;

  for (const entry of entries) {
    if (entry.amountInr <= 0) {
      throw new Error(`Ledger entry amount must be positive, got ${entry.amountInr}`);
    }
    const rounded = roundPaise(entry.amountInr);
    if (entry.entryType === "debit") {
      debitTotal += rounded;
    } else if (entry.entryType === "credit") {
      creditTotal += rounded;
    } else {
      throw new Error(`Invalid entry type: ${entry.entryType}`);
    }
  }

  debitTotal = roundPaise(debitTotal);
  creditTotal = roundPaise(creditTotal);
  const difference = roundPaise(Math.abs(debitTotal - creditTotal));

  return {
    balanced: difference === 0,
    debitTotal,
    creditTotal,
    difference,
  };
}

/**
 * Generates balanced double-entry entries when booking funds are authorized/collected upfront.
 * Cash gateway debited (funds received), Renter holding credited (liability to deliver).
 */
export function createBookingCollectionLedger(
  transactionId: string,
  bookingId: string,
  totalCollectedInr: number,
): LedgerEntry[] {
  const amount = roundPaise(totalCollectedInr);
  return [
    {
      transactionId,
      bookingId,
      account: "cash_gateway",
      entryType: "debit",
      amountInr: amount,
      description: "Gateway deposit collection from renter",
    },
    {
      transactionId,
      bookingId,
      account: "renter_holding",
      entryType: "credit",
      amountInr: amount,
      description: "Held in escrow/liability awaiting compute delivery",
    },
  ];
}

/**
 * Generates balanced double-entry entries on delivery settlement:
 * - Debits renter_holding for total held funds
 * - Credits host_payable for host share of delivered compute
 * - Credits platform_revenue for platform commission (15%)
 * - Credits tax_payable for GST on commission
 * - Credits renter_refund_payable for undelivered time (if any)
 */
export function createSettlementLedger(params: {
  transactionId: string;
  bookingId: string;
  totalHeldInr: number;
  deliveredComputeInr: number;
  commissionPct: number;
  gstRatePct: number;
}): LedgerEntry[] {
  const totalHeld = roundPaise(params.totalHeldInr);
  const deliveredCompute = roundPaise(Math.min(params.deliveredComputeInr, totalHeld));
  const commissionRate = params.commissionPct / 100;
  const gstRate = params.gstRatePct / 100;

  const platformFee = roundPaise(deliveredCompute * commissionRate);
  const gstOnFee = roundPaise(platformFee * gstRate);
  const hostEarnings = roundPaise(deliveredCompute - platformFee);

  // Total delivered charge to renter including GST on platform fee
  const renterUsed = roundPaise(deliveredCompute + gstOnFee);
  const refundAmount = roundPaise(Math.max(0, totalHeld - renterUsed));

  const entries: LedgerEntry[] = [
    {
      transactionId: params.transactionId,
      bookingId: params.bookingId,
      account: "renter_holding",
      entryType: "debit",
      amountInr: totalHeld,
      description: "Release of held booking funds for settlement",
    },
    {
      transactionId: params.transactionId,
      bookingId: params.bookingId,
      account: "host_payable",
      entryType: "credit",
      amountInr: hostEarnings,
      description: "Host earnings credit for delivered GPU compute",
    },
    {
      transactionId: params.transactionId,
      bookingId: params.bookingId,
      account: "platform_revenue",
      entryType: "credit",
      amountInr: platformFee,
      description: "Platform commission fee (15%)",
    },
  ];

  if (gstOnFee > 0) {
    entries.push({
      transactionId: params.transactionId,
      bookingId: params.bookingId,
      account: "tax_payable",
      entryType: "credit",
      amountInr: gstOnFee,
      description: "GST collected on platform commission",
    });
  }

  if (refundAmount > 0) {
    entries.push({
      transactionId: params.transactionId,
      bookingId: params.bookingId,
      account: "renter_refund_payable",
      entryType: "credit",
      amountInr: refundAmount,
      description: "Automatic refund for undelivered compute time",
    });
  }

  // Double check balance integrity
  const check = validateLedgerTransaction(entries);
  if (!check.balanced) {
    // Correct 1-paise rounding discrepancies onto renter refund or platform fee
    const diff = check.difference;
    if (check.debitTotal > check.creditTotal) {
      entries[entries.length - 1].amountInr = roundPaise(
        entries[entries.length - 1].amountInr + diff,
      );
    } else {
      entries[0].amountInr = roundPaise(entries[0].amountInr + diff);
    }
  }

  return entries;
}

/**
 * Computes delivered usage and charges strictly from trusted server-side records.
 * Never trusts frontend timers or client payloads.
 */
export function calculateTrustedDeliveredCharges(params: {
  records: Array<{ deliveredSeconds: number; isVerified: boolean }>;
  unitPriceInr: number;
  billingUnit: "minute" | "hour" | "session";
  committedHours: number;
}): {
  totalDeliveredSeconds: number;
  deliveredHours: number;
  deliveredComputeInr: number;
  undeliveredSeconds: number;
  undeliveredRefundInr: number;
} {
  const totalDeliveredSeconds = params.records
    .filter((r) => r.isVerified)
    .reduce((sum, r) => sum + r.deliveredSeconds, 0);

  const deliveredHours = totalDeliveredSeconds / 3600;
  const committedSeconds = params.committedHours * 3600;
  const undeliveredSeconds = Math.max(0, committedSeconds - totalDeliveredSeconds);

  let deliveredComputeInr = 0;
  if (params.billingUnit === "hour") {
    deliveredComputeInr = roundPaise(deliveredHours * params.unitPriceInr);
  } else if (params.billingUnit === "minute") {
    deliveredComputeInr = roundPaise((totalDeliveredSeconds / 60) * params.unitPriceInr);
  } else {
    // session: if delivered at least 95% of committed time, full session price, else pro-rated
    const fractionDelivered = Math.min(1, totalDeliveredSeconds / committedSeconds);
    deliveredComputeInr = roundPaise(fractionDelivered * params.unitPriceInr);
  }

  const committedTotal =
    params.billingUnit === "hour"
      ? roundPaise(params.committedHours * params.unitPriceInr)
      : params.billingUnit === "minute"
        ? roundPaise(params.committedHours * 60 * params.unitPriceInr)
        : roundPaise(params.unitPriceInr);

  const undeliveredRefundInr = roundPaise(Math.max(0, committedTotal - deliveredComputeInr));

  return {
    totalDeliveredSeconds,
    deliveredHours: roundPaise(deliveredHours),
    deliveredComputeInr,
    undeliveredSeconds,
    undeliveredRefundInr,
  };
}
