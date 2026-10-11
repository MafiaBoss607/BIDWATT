export type BillingUnit = "minute" | "hour" | "session";

export interface OfferData {
  id: string;
  conversation_id: string;
  proposer_id: string;
  recipient_id: string;
  supersedes_id?: string | null;
  gpu_model: string;
  min_specs: string;
  vram_gb: number;
  start_at: string;
  duration_hours: number;
  billing_unit: BillingUnit;
  unit_price_inr: number;
  est_total_inr: number;
  runtime: string;
  interruption_allowed: boolean;
  storage_terms: string;
  bandwidth_terms: string;
  cancellation_terms: string;
  expires_at: string;
  status: "pending" | "accepted" | "rejected" | "countered" | "expired" | "withdrawn";
  responded_at?: string | null;
  created_at: string;
}

/** Same formula the server uses in create_offer. */
export function estimateTotal(unit: BillingUnit, price: number, hours: number): number {
  const raw = unit === "minute" ? price * hours * 60 : unit === "hour" ? price * hours : price;
  return Math.round(raw * 100) / 100;
}

/** Pending offers past their expiry are shown (and treated by the server) as expired. */
export function displayStatus(o: { status: string; expires_at: string }, now = Date.now()): string {
  return o.status === "pending" && new Date(o.expires_at).getTime() <= now ? "expired" : o.status;
}

/** Validates whether an offer is currently active and can be responded to. */
export function canRespondToOffer(
  offer: { status: string; expires_at: string; proposer_id: string; recipient_id: string },
  userId: string,
  now = Date.now(),
): { allowed: boolean; error?: string } {
  if (offer.proposer_id === userId) {
    return { allowed: false, error: "Only the recipient can respond to an offer" };
  }
  if (offer.recipient_id !== userId) {
    return { allowed: false, error: "Only the recipient can respond to an offer" };
  }
  if (offer.status !== "pending") {
    return { allowed: false, error: `Offer is already ${offer.status}` };
  }
  if (new Date(offer.expires_at).getTime() <= now) {
    return { allowed: false, error: "Offer has expired" };
  }
  return { allowed: true };
}

/** Validates immutability check on existing terms vs updated terms */
export function validateOfferImmutability(
  original: OfferData,
  updates: Partial<OfferData>,
): { allowed: boolean; error?: string } {
  const immutableFields: (keyof OfferData)[] = [
    "conversation_id",
    "proposer_id",
    "recipient_id",
    "supersedes_id",
    "gpu_model",
    "min_specs",
    "vram_gb",
    "start_at",
    "duration_hours",
    "billing_unit",
    "unit_price_inr",
    "est_total_inr",
    "runtime",
    "interruption_allowed",
    "storage_terms",
    "bandwidth_terms",
    "cancellation_terms",
    "expires_at",
    "created_at",
  ];

  for (const field of immutableFields) {
    if (field in updates && updates[field] !== undefined && updates[field] !== original[field]) {
      return { allowed: false, error: "Offer terms are immutable; send a new offer instead" };
    }
  }

  if (original.status !== "pending" && updates.status && updates.status !== original.status) {
    return { allowed: false, error: `Offer is already ${original.status}` };
  }

  return { allowed: true };
}

/** Validates that blocked users cannot interact (messages, offers, ally requests). */
export function validateBlockedInteraction(
  userA: string,
  userB: string,
  blockedPairs: Array<{ blocker_id: string; blocked_id: string }>,
): { allowed: boolean; error?: string } {
  const isBlocked = blockedPairs.some(
    (b) =>
      (b.blocker_id === userA && b.blocked_id === userB) ||
      (b.blocker_id === userB && b.blocked_id === userA),
  );
  if (isBlocked) {
    return { allowed: false, error: "You cannot contact this user" };
  }
  return { allowed: true };
}

export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
export const ATTACHMENT_MAX = 5 * 1024 * 1024;
export function attachmentError(f: { type: string; size: number }): string | null {
  if (!ATTACHMENT_TYPES.includes(f.type)) return "Only PNG, JPEG, WebP, PDF or plain text files.";
  if (f.size > ATTACHMENT_MAX) return "Files must be 5 MB or smaller.";
  return null;
}
