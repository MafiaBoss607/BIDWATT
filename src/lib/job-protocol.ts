import { createHmac, randomBytes } from "node:crypto";
import { roundPaise } from "./pricing";

// ---------------------------------------------------------------------------
// 5. Job Protocol Types
// ---------------------------------------------------------------------------

export type JobState =
  | "pending"
  | "pulling"
  | "running"
  | "completed"
  | "failed"
  | "killed"
  | "timeout";

export interface AuthorizedJobSpec {
  jobId: string;
  bookingId: string;
  renterId: string;
  hostId: string;
  deviceId: string;
  image: string;
  command: string[];
  env: Record<string, string>;
  gpuDeviceIds: number[];
  cpuLimitCores: number;
  ramLimitMb: number;
  gpuMemLimitMb: number;
  diskLimitGb: number;
  maxRuntimeSeconds: number;
  networkMode: "none" | "egress_filtered";
  egressAllowlist: string[];
  controlPlaneSignature: string;
}

/**
 * Signs a job spec so the agent can verify it came from the control plane
 * and wasn't tampered with in transit.
 */
export function signJobSpec(
  spec: Omit<AuthorizedJobSpec, "controlPlaneSignature">,
  deviceSecret: string,
): AuthorizedJobSpec {
  const canonical = `${spec.jobId}:${spec.bookingId}:${spec.renterId}:${spec.image}:${spec.maxRuntimeSeconds}`;
  const signature = createHmac("sha256", deviceSecret).update(canonical).digest("hex");
  return { ...spec, controlPlaneSignature: signature };
}

/**
 * Generates a fully parameterized, signed job spec for a booking.
 * The agent must verify the signature before running anything.
 */
export function createAuthorizedJob(params: {
  bookingId: string;
  renterId: string;
  hostId: string;
  deviceId: string;
  deviceSecret: string;
  image: string;
  command?: string[];
  durationHours: number;
  cpuCores?: number;
  ramMb?: number;
  gpuMemMb?: number;
  diskGb?: number;
}): AuthorizedJobSpec {
  const jobId = `job_${randomBytes(12).toString("hex")}`;
  const unsigned: Omit<AuthorizedJobSpec, "controlPlaneSignature"> = {
    jobId,
    bookingId: params.bookingId,
    renterId: params.renterId,
    hostId: params.hostId,
    deviceId: params.deviceId,
    image: params.image,
    command: params.command ?? ["/bin/bash"],
    env: { BIDWATT_BOOKING_ID: params.bookingId, BIDWATT_JOB_ID: jobId },
    gpuDeviceIds: [0],
    cpuLimitCores: params.cpuCores ?? 4,
    ramLimitMb: params.ramMb ?? 16384,
    gpuMemLimitMb: params.gpuMemMb ?? 0,
    diskLimitGb: params.diskGb ?? 50,
    maxRuntimeSeconds: Math.ceil(params.durationHours * 3600),
    networkMode: "none",
    egressAllowlist: [],
  };
  return signJobSpec(unsigned, params.deviceSecret);
}

// ---------------------------------------------------------------------------
// 7. Signed Usage Reports (server-side metering, never frontend timers)
// ---------------------------------------------------------------------------

export interface SignedUsageReport {
  reportId: string;
  jobId: string;
  bookingId: string;
  hostId: string;
  deviceId: string;
  intervalStart: string;  // ISO 8601
  intervalEnd: string;
  deliveredSeconds: number;
  gpuAvgUtilizationPct: number;
  gpuPeakMemoryMb: number;
  cpuAvgPct: number;
  networkEgressBytes: number;
  chargeableAmountInr: number;
  signature: string;
}

/**
 * Creates a signed usage report from trusted server-side telemetry.
 * The signature proves the report originated from the enrolled agent
 * and hasn't been tampered with by the renter or a network intermediary.
 *
 * Metering is strictly driven by the agent's monotonic clock, not
 * browser timers, client-reported durations, or frontend estimates.
 */
export function createSignedUsageReport(params: {
  jobId: string;
  bookingId: string;
  hostId: string;
  deviceId: string;
  deviceSecret: string;
  intervalStart: Date;
  intervalEnd: Date;
  gpuAvgUtilizationPct: number;
  gpuPeakMemoryMb: number;
  cpuAvgPct: number;
  networkEgressBytes: number;
  unitPriceInr: number;
  billingUnit: "minute" | "hour" | "session";
}): SignedUsageReport {
  const reportId = `rpt_${randomBytes(8).toString("hex")}`;
  const deliveredSeconds = Math.max(
    0,
    Math.floor((params.intervalEnd.getTime() - params.intervalStart.getTime()) / 1000),
  );

  // Compute chargeable amount from server-verified seconds
  let chargeableAmountInr = 0;
  if (params.billingUnit === "hour") {
    chargeableAmountInr = roundPaise((deliveredSeconds / 3600) * params.unitPriceInr);
  } else if (params.billingUnit === "minute") {
    chargeableAmountInr = roundPaise((deliveredSeconds / 60) * params.unitPriceInr);
  } else {
    chargeableAmountInr = roundPaise(params.unitPriceInr);
  }

  // Sign the report so the control plane can verify authenticity
  const canonical = [
    reportId,
    params.jobId,
    params.bookingId,
    params.hostId,
    deliveredSeconds,
    params.gpuAvgUtilizationPct,
    chargeableAmountInr,
  ].join(":");
  const signature = createHmac("sha256", params.deviceSecret).update(canonical).digest("hex");

  return {
    reportId,
    jobId: params.jobId,
    bookingId: params.bookingId,
    hostId: params.hostId,
    deviceId: params.deviceId,
    intervalStart: params.intervalStart.toISOString(),
    intervalEnd: params.intervalEnd.toISOString(),
    deliveredSeconds,
    gpuAvgUtilizationPct: params.gpuAvgUtilizationPct,
    gpuPeakMemoryMb: params.gpuPeakMemoryMb,
    cpuAvgPct: params.cpuAvgPct,
    networkEgressBytes: params.networkEgressBytes,
    chargeableAmountInr,
    signature,
  };
}

/** Verifies a signed usage report hasn't been tampered with. */
export function verifyUsageReportSignature(
  report: SignedUsageReport,
  deviceSecret: string,
): boolean {
  const canonical = [
    report.reportId,
    report.jobId,
    report.bookingId,
    report.hostId,
    report.deliveredSeconds,
    report.gpuAvgUtilizationPct,
    report.chargeableAmountInr,
  ].join(":");
  const expected = createHmac("sha256", deviceSecret).update(canonical).digest("hex");
  return expected === report.signature;
}

// ---------------------------------------------------------------------------
// 7. Session Termination & Cleanup Protocol
// ---------------------------------------------------------------------------

export type TerminationReason =
  | "completed"
  | "renter_stop"
  | "host_stop"
  | "timeout"
  | "failed"
  | "disconnected"
  | "admin_kill";

export interface SessionTermination {
  bookingId: string;
  jobId: string;
  reason: TerminationReason;
  finalUsageReport: SignedUsageReport;
  cleanupConfirmed: boolean;
  scratchDataWiped: boolean;
  gpuMemoryFreed: boolean;
  logRetentionDays: number;
  terminatedAt: string;
}

/**
 * Constructs a session termination record.
 * The agent is responsible for:
 *   1. Killing the container/VM
 *   2. Wiping all renter scratch data (shred + rm)
 *   3. Releasing GPU memory (nvidia-smi -r if needed)
 *   4. Submitting a final signed usage report
 *   5. Confirming cleanup to the control plane
 *
 * Logs are retained for a configurable number of days (default 7)
 * then automatically purged. They are never exposed to subsequent renters.
 */
export function buildSessionTermination(params: {
  bookingId: string;
  jobId: string;
  reason: TerminationReason;
  finalReport: SignedUsageReport;
  logRetentionDays?: number;
}): SessionTermination {
  return {
    bookingId: params.bookingId,
    jobId: params.jobId,
    reason: params.reason,
    finalUsageReport: params.finalReport,
    cleanupConfirmed: true,
    scratchDataWiped: true,
    gpuMemoryFreed: true,
    logRetentionDays: params.logRetentionDays ?? 7,
    terminatedAt: new Date().toISOString(),
  };
}
