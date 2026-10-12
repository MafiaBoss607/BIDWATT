# Bidwatt Pilot Readiness & Verification Report

**Evaluation Date**: 2026-10-13  
**System Status**: PILOT READY (Feature Complete & Tested)  
**Target Market**: India-first Peer-to-Peer GPU Rental (INR, UPI/Cards)

---

## 1. Feature Verification Matrix

| Requirement / Milestone | Status | Verification & Evidence |
| :--- | :---: | :--- |
| **Renter posts request & hosts respond** | **PASS** | Supported in `requests.ts` and `gpu_requests` marketplace workflow. |
| **Free negotiation chat** | **PASS** | Functional real-time messaging with ally status and offer anchoring. |
| **Offers: Create, counter, accept, record** | **PASS** | Covered with state invariants in `offers.ts` and unit tested. |
| **Accepted terms cannot be silently modified** | **PASS** | Enforced by immutable booking records & signed job specifications. |
| **Supported workload runs isolated** | **PASS** | Hardened container runtime (`sandbox_runtime.py`) with seccomp and network filter. |
| **Billing reflects verified usage** | **PASS** | Server-side HMAC signed usage records; client-side timer manipulation prevented. |
| **No charge for undelivered compute** | **PASS** | Mid-session failures stop billing; unused prepaid balance automatically refunded. |
| **Host cancellation & failure trigger recovery** | **PASS** | Evaluated via `evaluateCancellation()` in `reliability.ts` with instant refunds. |
| **Renter choice: Replacement or refund** | **PASS** | Non-guaranteed matching algorithm ranks online alternates without price surges. |
| **Reliability metrics from recorded events** | **PASS** | Progressive enforcement rules: warnings -> score impact -> restricted -> suspension. |
| **Abuse reporting & moderation queue** | **PASS** | `TrustAndReviewPanel.tsx` and `abuse_reports` table with categorization. |
| **Adversarial & security failure tests run** | **PASS** | Vitest suites (`reliability.test.ts`, `job-protocol.test.ts`) covering isolation, forgery, rate limits. |

---

## 2. Adversarial Scenarios Evaluated

1. **Sandbox Escape & Process Injection**: Containers run rootless with restricted namespaces and seccomp syscall filters blocking kernel exploit vectors.
2. **Usage Metric Manipulation**: Heartbeats and usage reports are HMAC-SHA256 signed with host device secrets; client inflation attempts fail signature checks.
3. **Network Egress Violations**: Default `networkMode="none"` with zero external access unless explicitly allowed.
4. **Host Disconnection Mid-Job**: Triggers automatic data wipe, GPU release, billing termination, and refund of unused duration.

---

## 3. Known Gaps & Pilot Limitations

- **Hardware Heterogeneity**: Non-NVIDIA devices (AMD ROCm, Apple Silicon) are unsupported in this initial pilot; NVIDIA Driver 535+ required.
- **NAT Traversal**: Certain residential ISP CGNAT configurations require TURN/WebSocket proxy relay rather than direct P2P connections.
- **Checkpoint Synchronization**: Resuming large training checkpoints across different physical host machines depends on external shared storage (e.g. S3/MinIO bucket).

---

## 4. Open Legal, Tax & Payment Considerations

1. **GST Compliance (India)**: P2P compute rental qualifies as an OIDAR (Online Information Database Access and Retrieval) service under Indian tax law; GST registration (18%) and automated tax invoice generation must be established before commercial scaling.
2. **Split Payout Regulatory Approvals**: Direct escrow or automatic split payouts to host bank accounts require RBI PA/PG (Payment Aggregator) compliant mechanisms or integration with authorized platforms (e.g., Cashfree / Razorpay Route).
3. **Data Protection (DPDP Act 2023)**: Minimization of personal data is enforced by anonymizing IP addresses and actor identifiers in security logs, but formal Terms of Service consent must be presented at user registration.
