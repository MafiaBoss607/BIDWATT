export type BookingState =
  | "OFFER_PENDING"
  | "BOOKING_CONFIRMED"
  | "HOST_PREPARING"
  | "READY_TO_START"
  | "RUNNING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "DISPUTED";

export type Role = "host" | "renter";
export type AllowedActor = "host" | "renter" | "either";

export interface BookingTransitionRule {
  from: BookingState;
  to: BookingState;
  actor: AllowedActor;
}

export const BOOKING_TRANSITIONS: BookingTransitionRule[] = [
  { from: "OFFER_PENDING", to: "BOOKING_CONFIRMED", actor: "either" },
  { from: "BOOKING_CONFIRMED", to: "HOST_PREPARING", actor: "host" },
  { from: "BOOKING_CONFIRMED", to: "CANCELLED", actor: "either" },
  { from: "HOST_PREPARING", to: "READY_TO_START", actor: "host" },
  { from: "HOST_PREPARING", to: "CANCELLED", actor: "either" },
  { from: "HOST_PREPARING", to: "FAILED", actor: "host" },
  { from: "READY_TO_START", to: "RUNNING", actor: "renter" },
  { from: "READY_TO_START", to: "CANCELLED", actor: "either" },
  { from: "READY_TO_START", to: "FAILED", actor: "host" },
  { from: "RUNNING", to: "COMPLETED", actor: "either" },
  { from: "RUNNING", to: "FAILED", actor: "either" },
  { from: "RUNNING", to: "DISPUTED", actor: "either" },
  { from: "COMPLETED", to: "DISPUTED", actor: "renter" },
  { from: "CANCELLED", to: "REFUND_PENDING", actor: "either" },
  { from: "FAILED", to: "REFUND_PENDING", actor: "either" },
  { from: "DISPUTED", to: "REFUND_PENDING", actor: "host" },
  { from: "DISPUTED", to: "COMPLETED", actor: "renter" },
  { from: "REFUND_PENDING", to: "REFUNDED", actor: "host" },
];

/** Validates whether a state transition is legal and permitted for the actor. */
export function validateBookingTransition(
  currentState: BookingState,
  targetState: BookingState,
  role: Role,
): { valid: boolean; error?: string } {
  const rule = BOOKING_TRANSITIONS.find(
    (t) => t.from === currentState && t.to === targetState,
  );
  if (!rule) {
    return { valid: false, error: `Illegal transition ${currentState} -> ${targetState}` };
  }
  if (rule.actor !== "either" && rule.actor !== role) {
    return { valid: false, error: `Only the ${rule.actor} can move ${currentState} -> ${targetState}` };
  }
  return { valid: true };
}
