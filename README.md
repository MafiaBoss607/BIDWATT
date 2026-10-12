# Bidwatt

**Your GPU. Your price. Your terms.**

Bidwatt is an India-first peer-to-peer GPU rental marketplace designed for researchers, students, indie developers, and AI/ML builders to rent idle GPU power directly from hardware owners (**hosts**). Built around transparent negotiation, immutable booking contracts, INR pricing (UPI / Cards), and a zero-trust host agent runtime.

---

## Table of Contents

- [Core Principles & Features](#core-principles--features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Layout](#project-layout)
- [Getting Started](#getting-started)
- [Booking Lifecycle & State Machine](#booking-lifecycle--state-machine)
- [Host Agent & Sandboxed Compute Runtime](#host-agent--sandboxed-compute-runtime)
- [Reliability, Recovery & Trust](#reliability-recovery--trust)
- [Security & Threat Model](#security--threat-model)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Pilot Runbook & Deployment](#pilot-runbook--deployment)
- [Regulatory & Open Considerations](#regulatory--open-considerations)
- [License](#license)

---

## Core Principles & Features

- **Social Live Stream & Request Board**: Renters broadcast compute needs with specs, duration, and INR budget into a real-time feed (`For You`, `Top Budget`, `Live Stream`).
- **Negotiation Before Commitment**: Free-form real-time chat with structured offer cards (`Create`, `Counter`, `Accept`). An accepted offer creates an immutable booking.
- **Pre-Session Readiness Check**: The host agent validates GPU availability, VRAM allocation, container engine health, and temperatures before initiating session billing.
- **Server-Side Metering & Signed Usage Reports**: Billing derives strictly from HMAC-SHA256 signed runtime usage records. Zero reliance on browser timers.
- **No Charge for Undelivered Compute**: Mid-session hardware or connection failures immediately stop billing, issuing automated refunds for unused duration.
- **Disaster Recovery (Non-Guaranteed Replacement)**: Algorithmic ranking of alternate compatible hosts with checkpoint resumption options, giving the renter a clear choice between switching hosts or taking an instant 100% refund.
- **Progressive Reliability Enforcement**: Hosts accumulate transparent reliability metrics (uptime, completed jobs, cancellation rate). New hosts are onboarded as *provisional*; repeated preventable cancellations trigger ranking demotions or suspensions.
- **Mutual Reputation & Abuse Moderation**: Two-way reviews (hardware accuracy, communication, stability) paired with a dedicated moderation queue for reporting unauthorized mining, sandbox escapes, or spoofed hardware.

---

## System Architecture

```text
       Browser Web App (TanStack Start + React + Vite)
                            |
                            v
       Bidwatt Control Plane (TypeScript API / Edge Engine)
      /                     |                           \
     v                      v                            v
PostgreSQL (RLS)     Redis Stream / Relays       Payment Provider
(Ledger, Bookings,   (Heartbeats, Incidents,     (UPI, NetBanking,
 Reliability, Trust)  Rate Limits)                Cards in INR)
                            |
         Encrypted Control Plane Channel (HMAC-SHA256)
                            |
                            v
           Bidwatt Host Agent Daemon (Linux / Python)
              └── Hardened Container Isolation Runtime
                  ├── Rootless Namespaces & cgroups
                  ├── Seccomp Filter (Syscall deny-list)
                  ├── Network Egress Guard (Default: NONE)
                  └── NVIDIA Container Toolkit (GPU Passthrough)
```

---

## Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Web Framework** | TanStack Start + React 19 + TypeScript | Full-stack SSR routing with typed loaders |
| **Styling & UI** | Tailwind CSS + Radix UI + Lucide | Rich dark theme with signature electric amber accents |
| **Database & Auth** | PostgreSQL + Supabase Client | Row-Level Security (RLS) enforcement on all operations |
| **Host Agent** | Python 3.10+ / Linux Daemon | System telemetry, VRAM detection, one-time enrollment |
| **Container Sandbox** | Docker Engine + NVIDIA Container Toolkit | Rootless, capability-dropped workload isolation |
| **Payments & Ledger** | Double-Entry Accounting Ledger (INR) | Append-only financial tracking with provider adapters |
| **Testing** | Vitest + Testing Library | 79+ unit, state machine, and adversarial test cases |
| **Deployment** | Docker Compose + Multi-stage Dockerfile | Production-ready containerized control plane |

---

## Project Layout

```text
Bidwatt/
├── src/
│   ├── routes/                # TanStack Start file-based routing
│   │   ├── index.tsx          # Dynamic feed / Landing router
│   │   ├── auth.tsx           # Authentication (Email, Magic Links, Google OAuth)
│   │   ├── requests.*.tsx     # Social request stream and submission
│   │   ├── chat.*.tsx         # Real-time chat & offer negotiation
│   │   ├── bookings.*.tsx     # Booking detail, session proxy & disputes
│   │   ├── hosting.tsx        # Host machine management & payout dashboard
│   │   └── allies.tsx         # Ally network direct requests
│   ├── components/            # React UI components & dialogs
│   │   ├── SocialRequestFeed.tsx    # Live request feed with quick composer
│   │   ├── BidwattLogo.tsx          # Vector GPU microchip brand icon
│   │   ├── TrustAndReviewPanel.tsx  # Reviews, abuse reports & replacements
│   │   └── ReadinessCheckModal.tsx  # Host pre-session verification
│   ├── lib/                   # Business logic & domain models
│   │   ├── pricing.ts         # Paise rounding & commission calculation
│   │   ├── booking-state.ts   # State transition engine & invariants
│   │   ├── job-protocol.ts    # Control plane job signing & usage verification
│   │   ├── reliability.ts     # Cancellation taxonomy & host scoring
│   │   ├── security.ts        # Rate limiting & privacy-preserving audit logs
│   │   └── ledger.ts          # Double-entry transaction journal
│   └── agent/                 # Host compute runtime
│       ├── bidwatt_agent.py   # Agent daemon (heartbeat, enrollment)
│       └── sandbox_runtime.py # Hardened container isolation layer
├── drizzle/
│   └── migrations/            # SQL migration scripts (0001 - 0006)
├── docs/
│   ├── PILOT_RUNBOOK.md       # Operational runbook & recovery procedures
│   └── READINESS_REPORT.md    # Pilot verification & compliance matrix
├── docker-compose.prod.yml    # Production container orchestration
├── vitest.config.ts           # Vitest configuration
└── package.json
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20 or higher
- **Package Manager**: npm or bun
- **Docker**: For production container deployment or running the agent runtime
- **Python**: 3.10+ (for running the host agent locally)

### 2. Installation & Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:3000` in your browser.

### 3. Enrolling a Host Machine

1. Log in and navigate to the **Hosting** tab (`/hosting`).
2. Click **"Enroll Machine"** to generate a single-use token (valid 15 minutes).
3. On the Linux host machine with NVIDIA drivers, execute:
   ```bash
   python src/agent/bidwatt_agent.py --server http://localhost:3000 --token <ENROLLMENT_TOKEN>
   ```
4. The agent reports hardware specs, runs a GPU benchmark, and begins sending 30-second heartbeats.

---

## Booking Lifecycle & State Machine

```text
[OFFER_PENDING] ──Accept──> [BOOKING_CONFIRMED] ──Prepare──> [HOST_PREPARING]
                                                                    │
                                                        Readiness Check
                                                                    ▼
[RUNNING] <───────Start Session──────── [READY_TO_START]
    │
    ├── Usage Complete ──> [COMPLETED] ──> [SETTLED]
    │
    └── Mid-Session Failure ──> [REFUND_PENDING] ──> [REFUNDED]
                                       │
                                       └──> [REPLACEMENT_OFFERED]
```

Every transition is validated server-side against strict role permissions, verifying that accepted terms cannot be silently modified.

---

## Reliability, Recovery & Trust

1. **Cancellation Taxonomy**:
   - **Host Early Cancel (>2h before start)**: 100% refund, 0 score penalty.
   - **Host Last-Minute Cancel (<2h before start)**: 100% refund, automated replacement matching triggered, host reliability score penalized (`-6.0`).
   - **Technical Hardware Failure**: Session immediately stopped; renter charged *only* for delivered minutes; unused prepaid funds refunded.
2. **Progressive Enforcement**:
   - New hosts enter the `provisional` tier to prevent cold-start penalties.
   - Hosts drop to `restricted` (50% visibility demotion) if score drops below 70, or `suspended` for repeated violations.

---

## Testing & Quality Assurance

Run the comprehensive test suite with Vitest:

```bash
# Run all unit and adversarial test suites
npm test

# Run tests in watch mode
npm run test:watch
```

**79 passed tests** covering:
- Mathematical pricing invariants and paise rounding (`pricing.test.ts`)
- Offer concurrency and counter-offer replacement (`offers.test.ts`)
- Booking lifecycle transitions (`booking-state.test.ts`)
- Control plane job signing and usage report signature forgery (`job-protocol.test.ts`)
- Cancellation cause taxonomy and replacement ranking (`reliability.test.ts`)
- Rate limiting and audit log PII minimization (`reliability.test.ts`)

---

## Pilot Runbook & Deployment

To deploy the production stack via Docker Compose:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Consult [`docs/PILOT_RUNBOOK.md`](docs/PILOT_RUNBOOK.md) for operational playbooks on:
- Disaster recovery and node failover.
- Nightly PostgreSQL database backups and WAL archiving.
- Incident response for sandbox escape attempts or unauthorized mining.

---

## Regulatory & Open Considerations

- **Indian GST (18%)**: Compute rentals fall under OIDAR services; tax invoices are generated per booking.
- **RBI PA/PG Compliance**: Split payouts to hosts require compliant payment routing (e.g. Razorpay Route / Cashfree) before public scale.
- **DPDP Act (Data Minimization)**: Personal identifiers and IP addresses are masked in security logs to protect user privacy.

---

## License

All rights reserved © 2026 Bidwatt.
