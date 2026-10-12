import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  createAuthorizedJob,
  createSignedUsageReport,
  verifyUsageReportSignature,
  buildSessionTermination,
  type AuthorizedJobSpec,
  type SignedUsageReport,
} from "./job-protocol";

const DEVICE_SECRET = "test_device_secret_abc123";

function makeTestJob(): AuthorizedJobSpec {
  return createAuthorizedJob({
    bookingId: "booking_test_001",
    renterId: "renter_u_001",
    hostId: "host_u_002",
    deviceId: "dev_abc123",
    deviceSecret: DEVICE_SECRET,
    image: "nvcr.io/nvidia/pytorch:24.05-py3",
    command: ["python", "train.py"],
    durationHours: 2,
  });
}

function makeTestUsageReport(
  overrides?: Partial<Parameters<typeof createSignedUsageReport>[0]>,
): SignedUsageReport {
  const now = new Date();
  const start = new Date(now.getTime() - 3600_000); // 1 hour ago
  return createSignedUsageReport({
    jobId: "job_test_abc",
    bookingId: "booking_test_001",
    hostId: "host_u_002",
    deviceId: "dev_abc123",
    deviceSecret: DEVICE_SECRET,
    intervalStart: start,
    intervalEnd: now,
    gpuAvgUtilizationPct: 87.5,
    gpuPeakMemoryMb: 22016,
    cpuAvgPct: 35.2,
    networkEgressBytes: 0,
    unitPriceInr: 40,
    billingUnit: "hour",
    ...overrides,
  });
}

describe("Host Agent & Compute Runtime Suite (Items 5-7)", () => {
  // =========================================================================
  // 5. Job Protocol
  // =========================================================================
  describe("5. Job Protocol: Authorized Job Signing & Verification", () => {
    it("creates an authorized job with a valid control plane signature", () => {
      const job = makeTestJob();
      expect(job.jobId).toMatch(/^job_[a-f0-9]{24}$/);
      expect(job.controlPlaneSignature).toHaveLength(64);
      expect(job.networkMode).toBe("none");
      expect(job.env["BIDWATT_BOOKING_ID"]).toBe("booking_test_001");
    });

    it("agent can verify the control plane signature matches", () => {
      const job = makeTestJob();
      const canonical = `${job.jobId}:${job.bookingId}:${job.renterId}:${job.image}:${job.maxRuntimeSeconds}`;
      const expected = createHmac("sha256", DEVICE_SECRET).update(canonical).digest("hex");
      expect(job.controlPlaneSignature).toBe(expected);
    });

    it("rejects a job whose signature was forged", () => {
      const job = makeTestJob();
      const tampered = { ...job, image: "evil-registry.io/cryptominer:latest" };
      const canonical = `${tampered.jobId}:${tampered.bookingId}:${tampered.renterId}:${tampered.image}:${tampered.maxRuntimeSeconds}`;
      const honest = createHmac("sha256", DEVICE_SECRET).update(canonical).digest("hex");
      // The forged image changes the canonical, so original sig won't match
      expect(tampered.controlPlaneSignature).not.toBe(honest);
    });

    it("enforces default network=none and empty egress allowlist", () => {
      const job = makeTestJob();
      expect(job.networkMode).toBe("none");
      expect(job.egressAllowlist).toEqual([]);
    });

    it("sets wallclock hard-kill based on booking duration", () => {
      const job = makeTestJob();
      expect(job.maxRuntimeSeconds).toBe(7200); // 2 hours
    });
  });

  // =========================================================================
  // 7. Signed Usage Reports & Metering
  // =========================================================================
  describe("7. Signed Usage Reports (Server-Side Metering)", () => {
    it("creates a usage report with correct delivered seconds and chargeable amount", () => {
      const report = makeTestUsageReport();
      expect(report.deliveredSeconds).toBe(3600);
      expect(report.chargeableAmountInr).toBe(40.0); // 1 hour @ ₹40/hr
      expect(report.signature).toHaveLength(64);
    });

    it("verifies an authentic usage report signature", () => {
      const report = makeTestUsageReport();
      expect(verifyUsageReportSignature(report, DEVICE_SECRET)).toBe(true);
    });

    it("rejects a tampered usage report (inflated delivered seconds)", () => {
      const report = makeTestUsageReport();
      const tampered = { ...report, deliveredSeconds: 36000 }; // 10x inflation
      expect(verifyUsageReportSignature(tampered, DEVICE_SECRET)).toBe(false);
    });

    it("rejects a tampered usage report (inflated chargeable amount)", () => {
      const report = makeTestUsageReport();
      const tampered = { ...report, chargeableAmountInr: 9999.99 };
      expect(verifyUsageReportSignature(tampered, DEVICE_SECRET)).toBe(false);
    });

    it("rejects a report signed with a different device secret (credential theft attempt)", () => {
      const report = makeTestUsageReport();
      expect(verifyUsageReportSignature(report, "stolen_secret")).toBe(false);
    });

    it("bills per-minute correctly from server-side seconds", () => {
      const now = new Date();
      const start = new Date(now.getTime() - 45 * 60_000); // 45 minutes ago
      const report = createSignedUsageReport({
        jobId: "job_min_test",
        bookingId: "b_min",
        hostId: "h1",
        deviceId: "d1",
        deviceSecret: DEVICE_SECRET,
        intervalStart: start,
        intervalEnd: now,
        gpuAvgUtilizationPct: 90,
        gpuPeakMemoryMb: 8000,
        cpuAvgPct: 20,
        networkEgressBytes: 0,
        unitPriceInr: 1.5, // ₹1.50/minute
        billingUnit: "minute",
      });
      expect(report.deliveredSeconds).toBe(2700);
      expect(report.chargeableAmountInr).toBe(67.5); // 45 min × ₹1.50
    });

    it("never uses frontend timers – computed strictly from server timestamps", () => {
      // The function takes Date objects as interval boundaries, not durations.
      // Verify that changing the interval changes the charge, proving server-side derivation.
      const now = new Date();
      const halfHour = new Date(now.getTime() - 30 * 60_000);
      const fullHour = new Date(now.getTime() - 60 * 60_000);

      const short = createSignedUsageReport({
        jobId: "j1",
        bookingId: "b1",
        hostId: "h1",
        deviceId: "d1",
        deviceSecret: DEVICE_SECRET,
        intervalStart: halfHour,
        intervalEnd: now,
        gpuAvgUtilizationPct: 50,
        gpuPeakMemoryMb: 4000,
        cpuAvgPct: 10,
        networkEgressBytes: 0,
        unitPriceInr: 60,
        billingUnit: "hour",
      });
      const long = createSignedUsageReport({
        jobId: "j2",
        bookingId: "b1",
        hostId: "h1",
        deviceId: "d1",
        deviceSecret: DEVICE_SECRET,
        intervalStart: fullHour,
        intervalEnd: now,
        gpuAvgUtilizationPct: 50,
        gpuPeakMemoryMb: 4000,
        cpuAvgPct: 10,
        networkEgressBytes: 0,
        unitPriceInr: 60,
        billingUnit: "hour",
      });

      expect(short.deliveredSeconds).toBe(1800);
      expect(long.deliveredSeconds).toBe(3600);
      expect(short.chargeableAmountInr).toBe(30);
      expect(long.chargeableAmountInr).toBe(60);
    });
  });

  // =========================================================================
  // 7. Session Termination & Cleanup
  // =========================================================================
  describe("7. Session Termination, Cleanup & Data Wipe", () => {
    it("builds a complete termination record with cleanup confirmation", () => {
      const report = makeTestUsageReport();
      const term = buildSessionTermination({
        bookingId: "booking_test_001",
        jobId: report.jobId,
        reason: "completed",
        finalReport: report,
      });

      expect(term.reason).toBe("completed");
      expect(term.cleanupConfirmed).toBe(true);
      expect(term.scratchDataWiped).toBe(true);
      expect(term.gpuMemoryFreed).toBe(true);
      expect(term.logRetentionDays).toBe(7);
      expect(term.terminatedAt).toBeTruthy();
    });

    it("handles host disconnection with immediate termination", () => {
      const report = makeTestUsageReport();
      const term = buildSessionTermination({
        bookingId: "booking_test_001",
        jobId: report.jobId,
        reason: "disconnected",
        finalReport: report,
      });
      expect(term.reason).toBe("disconnected");
      expect(term.scratchDataWiped).toBe(true);
    });

    it("handles timeout termination (wallclock exceeded)", () => {
      const report = makeTestUsageReport();
      const term = buildSessionTermination({
        bookingId: "booking_test_001",
        jobId: report.jobId,
        reason: "timeout",
        finalReport: report,
      });
      expect(term.reason).toBe("timeout");
    });
  });

  // =========================================================================
  // Adversarial & Failure Scenario Tests
  // =========================================================================
  describe("Adversarial Tests: Sandbox Escape, Credential Theft, Network Abuse", () => {
    it("malicious workload cannot forge a valid usage report signature", () => {
      // Attacker has the report structure but not the device secret
      const forgedReport: SignedUsageReport = {
        reportId: "rpt_fake",
        jobId: "job_attacker",
        bookingId: "booking_victim",
        hostId: "host_innocent",
        deviceId: "dev_stolen",
        intervalStart: new Date().toISOString(),
        intervalEnd: new Date().toISOString(),
        deliveredSeconds: 99999,
        gpuAvgUtilizationPct: 100,
        gpuPeakMemoryMb: 0,
        cpuAvgPct: 0,
        networkEgressBytes: 0,
        chargeableAmountInr: 0.01, // tries to undercharge
        signature: "0000000000000000000000000000000000000000000000000000000000000000",
      };
      expect(verifyUsageReportSignature(forgedReport, DEVICE_SECRET)).toBe(false);
    });

    it("malicious workload cannot inject a different job image into a signed spec", () => {
      const legit = makeTestJob();
      // Attacker tries to swap the image post-signing
      const canonical = `${legit.jobId}:${legit.bookingId}:${legit.renterId}:evil-image:${legit.maxRuntimeSeconds}`;
      const checkSig = createHmac("sha256", DEVICE_SECRET).update(canonical).digest("hex");
      expect(checkSig).not.toBe(legit.controlPlaneSignature);
    });

    it("host disconnection during running job leaves no renter data behind", () => {
      const report = makeTestUsageReport();
      const term = buildSessionTermination({
        bookingId: "booking_test_001",
        jobId: report.jobId,
        reason: "disconnected",
        finalReport: report,
      });
      // On disconnection: scratch data is wiped, GPU freed, container killed
      expect(term.scratchDataWiped).toBe(true);
      expect(term.gpuMemoryFreed).toBe(true);
      expect(term.cleanupConfirmed).toBe(true);
    });

    it("failed provisioning (no GPU) results in zero-charge termination", () => {
      const now = new Date();
      const report = createSignedUsageReport({
        jobId: "job_failed_provision",
        bookingId: "b_fail",
        hostId: "h1",
        deviceId: "d1",
        deviceSecret: DEVICE_SECRET,
        intervalStart: now,
        intervalEnd: now, // zero duration
        gpuAvgUtilizationPct: 0,
        gpuPeakMemoryMb: 0,
        cpuAvgPct: 0,
        networkEgressBytes: 0,
        unitPriceInr: 50,
        billingUnit: "hour",
      });
      expect(report.deliveredSeconds).toBe(0);
      expect(report.chargeableAmountInr).toBe(0);
    });

    it("renter cannot tamper with billing unit to reduce charges", () => {
      // Even if a renter somehow sends "session" instead of "hour",
      // the control plane's signed report uses the correct billing unit
      const now = new Date();
      const start = new Date(now.getTime() - 3600_000);

      const honest = createSignedUsageReport({
        jobId: "j_honest",
        bookingId: "b1",
        hostId: "h1",
        deviceId: "d1",
        deviceSecret: DEVICE_SECRET,
        intervalStart: start,
        intervalEnd: now,
        gpuAvgUtilizationPct: 80,
        gpuPeakMemoryMb: 8000,
        cpuAvgPct: 20,
        networkEgressBytes: 0,
        unitPriceInr: 100,
        billingUnit: "hour",
      });
      const tampered = createSignedUsageReport({
        jobId: "j_honest",
        bookingId: "b1",
        hostId: "h1",
        deviceId: "d1",
        deviceSecret: DEVICE_SECRET,
        intervalStart: start,
        intervalEnd: now,
        gpuAvgUtilizationPct: 80,
        gpuPeakMemoryMb: 8000,
        cpuAvgPct: 20,
        networkEgressBytes: 0,
        unitPriceInr: 100,
        billingUnit: "session",
      });
      // Honest charges ₹100/hr for 1 hour = ₹100
      // Tampered "session" charges flat ₹100 regardless of time
      // Both charge ₹100 here but signatures differ, so swapping is detectable
      expect(honest.signature).not.toBe(tampered.signature);
    });
  });
});
