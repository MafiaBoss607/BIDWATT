import { createHmac, randomBytes } from "node:crypto";

export interface AgentEnrollmentToken {
  id: string;
  hostId: string;
  token: string;
  tokenHash: string;
  deviceLabel: string;
  expiresAt: Date;
  status: "active" | "used" | "expired" | "revoked";
}

export interface HardwareTelemetry {
  gpuModel: string;
  vramGb: number;
  vramTotalMb: number;
  driverVersion: string;
  cudaVersion: string;
  cpuModel: string;
  cpuCores: number;
  ramGb: number;
  diskFreeGb: number;
  osVersion: string;
  kernelVersion: string;
}

export interface BenchmarkSubmission {
  fp32TflopsEst: number;
  vramBandwidthGbpsEst: number;
  benchmarkScore: number;
  durationSeconds: number;
  signature: string;
}

export interface ReadinessCheckParams {
  bookingId: string;
  agentOnline: boolean;
  gpuIdle: boolean;
  runtimeReady: boolean;
  tempCelsius: number;
  diskFreeGb: number;
  memoryMbAvailable: number;
  minDiskRequiredGb?: number;
  maxAllowedTempCelsius?: number;
}

export interface ReadinessCheckResult {
  passed: boolean;
  failureReasons: string[];
  recommendedNextState: "READY_TO_START" | "CANCELLED";
}

export interface SessionCredential {
  bookingId: string;
  proxyToken: string;
  proxyEndpoint: string;
  sshPublicKey?: string;
  expiresAt: Date;
  isRevoked: boolean;
}

/** Generates a cryptographically secure one-time enrollment token for host agents. */
export function generateEnrollmentToken(hostId: string, deviceLabel = "Linux-GPU-Rig"): AgentEnrollmentToken {
  const rawToken = `bw_enroll_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHmac("sha256", "bidwatt_agent_enrollment_salt").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  return {
    id: `tok_${randomBytes(8).toString("hex")}`,
    hostId,
    token: rawToken,
    tokenHash,
    deviceLabel,
    expiresAt,
    status: "active",
  };
}

/** Verifies that a benchmark signature matches device calculations and isn't fabricated. */
export function verifyBenchmarkSubmission(
  submission: BenchmarkSubmission,
  deviceSecret: string,
): boolean {
  const payload = `${submission.benchmarkScore}:${submission.fp32TflopsEst}:${submission.vramBandwidthGbpsEst}:${submission.durationSeconds}`;
  const expectedSig = createHmac("sha256", deviceSecret).update(payload).digest("hex");
  return expectedSig === submission.signature;
}

/** Evaluates pre-session readiness criteria according to safety thresholds. */
export function evaluatePreSessionReadiness(params: ReadinessCheckParams): ReadinessCheckResult {
  const reasons: string[] = [];
  const minDisk = params.minDiskRequiredGb ?? 10.0;
  const maxTemp = params.maxAllowedTempCelsius ?? 85.0;

  if (!params.agentOnline) {
    reasons.push("Host compute agent daemon is unreachable or offline.");
  }
  if (!params.gpuIdle) {
    reasons.push("Host GPU is currently busy running other tasks.");
  }
  if (!params.runtimeReady) {
    reasons.push("Isolated container runtime (podman/docker) failed to initialize.");
  }
  if (params.tempCelsius > maxTemp) {
    reasons.push(`GPU thermal limit exceeded: ${params.tempCelsius}°C (max safe: ${maxTemp}°C).`);
  }
  if (params.diskFreeGb < minDisk) {
    reasons.push(`Insufficient host scratch disk: ${params.diskFreeGb} GB free (required: ${minDisk} GB).`);
  }
  if (params.memoryMbAvailable < 2048) {
    reasons.push(`Host available RAM too low: ${params.memoryMbAvailable} MB.`);
  }

  const passed = reasons.length === 0;
  return {
    passed,
    failureReasons: reasons,
    recommendedNextState: passed ? "READY_TO_START" : "CANCELLED",
  };
}

/** Issues short-lived session credentials with platform proxy encapsulation. */
export function issueSessionCredentials(bookingId: string, durationHours: number): SessionCredential {
  const proxyToken = `bw_sess_tok_${randomBytes(20).toString("hex")}`;
  const proxyEndpoint = `proxy-${bookingId.slice(0, 8)}.proxy.bidwatt.in:443`;
  const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000 + 15 * 60 * 1000); // duration + 15m buffer

  return {
    bookingId,
    proxyToken,
    proxyEndpoint,
    expiresAt,
    isRevoked: false,
  };
}

/** Revokes and invalidates session credentials immediately upon completion or cancellation. */
export function revokeSessionCredentials(cred: SessionCredential): SessionCredential {
  return {
    ...cred,
    isRevoked: true,
  };
}
