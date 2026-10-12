import { describe, it, expect } from "vitest";
import {
  generateEnrollmentToken,
  verifyBenchmarkSubmission,
  evaluatePreSessionReadiness,
  issueSessionCredentials,
  revokeSessionCredentials,
} from "./agent-control";
import { createHmac } from "node:crypto";

describe("Host Agent & Compute Runtime Suite (Items 1-4)", () => {
  describe("1. Agent Enrollment & Credentials", () => {
    it("generates a secure one-time enrollment token with expiration", () => {
      const tok = generateEnrollmentToken("host_user_123", "RTX-4090-Rig");
      expect(tok.token).toMatch(/^bw_enroll_[a-f0-9]{48}$/);
      expect(tok.tokenHash).toHaveLength(64);
      expect(tok.status).toBe("active");
      expect(tok.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("issues and rotates short-lived session credentials", () => {
      const cred = issueSessionCredentials("booking_abc_123", 2);
      expect(cred.proxyToken).toMatch(/^bw_sess_tok_[a-f0-9]{40}$/);
      expect(cred.proxyEndpoint).toContain("proxy-booking_");
      expect(cred.isRevoked).toBe(false);

      const revoked = revokeSessionCredentials(cred);
      expect(revoked.isRevoked).toBe(true);
    });
  });

  describe("2. Hardware Detection & Benchmark Signature Verification", () => {
    const deviceSecret = "secret_rig_xyz_987";
    const sub = {
      benchmarkScore: 8358,
      fp32TflopsEst: 82.58,
      vramBandwidthGbpsEst: 1008.0,
      durationSeconds: 0.5,
      signature: "",
    };

    const payload = `${sub.benchmarkScore}:${sub.fp32TflopsEst}:${sub.vramBandwidthGbpsEst}:${sub.durationSeconds}`;
    sub.signature = createHmac("sha256", deviceSecret).update(payload).digest("hex");

    it("verifies genuine hardware benchmark signature", () => {
      expect(verifyBenchmarkSubmission(sub, deviceSecret)).toBe(true);
    });

    it("rejects forged benchmark scores or tampered TFLOPS", () => {
      const forged = { ...sub, benchmarkScore: 99999 };
      expect(verifyBenchmarkSubmission(forged, deviceSecret)).toBe(false);
    });
  });

  describe("3. Pre-Session Readiness Checks & Safe State Transitions", () => {
    it("approves READY_TO_START when all environmental checks pass", () => {
      const check = evaluatePreSessionReadiness({
        bookingId: "b_1",
        agentOnline: true,
        gpuIdle: true,
        runtimeReady: true,
        tempCelsius: 52.0,
        diskFreeGb: 45.0,
        memoryMbAvailable: 8192,
      });

      expect(check.passed).toBe(true);
      expect(check.failureReasons).toHaveLength(0);
      expect(check.recommendedNextState).toBe("READY_TO_START");
    });

    it("triggers cancellation if agent is offline or machine shutdown", () => {
      const check = evaluatePreSessionReadiness({
        bookingId: "b_2",
        agentOnline: false, // offline
        gpuIdle: true,
        runtimeReady: true,
        tempCelsius: 40.0,
        diskFreeGb: 50.0,
        memoryMbAvailable: 8192,
      });

      expect(check.passed).toBe(false);
      expect(check.failureReasons).toContain("Host compute agent daemon is unreachable or offline.");
      expect(check.recommendedNextState).toBe("CANCELLED");
    });

    it("fails readiness if host GPU temperature exceeds safe limits", () => {
      const check = evaluatePreSessionReadiness({
        bookingId: "b_3",
        agentOnline: true,
        gpuIdle: true,
        runtimeReady: true,
        tempCelsius: 91.0, // overheated
        diskFreeGb: 50.0,
        memoryMbAvailable: 8192,
      });

      expect(check.passed).toBe(false);
      expect(check.failureReasons.some((r) => r.includes("thermal limit"))).toBe(true);
      expect(check.recommendedNextState).toBe("CANCELLED");
    });

    it("fails readiness if host scratch disk is insufficient", () => {
      const check = evaluatePreSessionReadiness({
        bookingId: "b_4",
        agentOnline: true,
        gpuIdle: true,
        runtimeReady: true,
        tempCelsius: 45.0,
        diskFreeGb: 2.1, // less than 10GB
        memoryMbAvailable: 8192,
      });

      expect(check.passed).toBe(false);
      expect(check.failureReasons.some((r) => r.includes("disk"))).toBe(true);
      expect(check.recommendedNextState).toBe("CANCELLED");
    });
  });
});
