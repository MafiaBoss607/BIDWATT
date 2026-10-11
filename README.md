# Bidwatt

**Your GPU. Your price. Your terms.**

Bidwatt is a peer-to-peer GPU rental marketplace. Owners of compatible desktops and laptops (**hosts**) rent out idle GPU power to people who need affordable compute (**renters**): students, indie developers, researchers, and AI/ML learners. India-first, with INR pricing and local payment methods.

Unlike a fixed-price cloud dashboard, Bidwatt is built around **negotiation**: renters post requests, hosts respond, and both sides talk in free-form chat and settle terms through structured offers.

> **Status:** Early development. Not ready for production use or for running real renter workloads on real hosts.

---

## Table of Contents

- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Running Tests](#running-tests)
- [Booking States](#booking-states)
- [Security](#security)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

- **Request-first marketplace:** renters post what they need (VRAM, duration, budget) and hosts respond with offers. Browsable listings are available too.
- **Free-form chat plus structured offers:** negotiate naturally, then lock terms into an offer card that can be accepted, rejected, or countered.
- **Immutable booking terms:** only an accepted offer creates a booking, and any change requires a new offer accepted by both parties.
- **Performance transparency:** verified hardware, benchmark results, VRAM, availability, and reliability. Matches are ranked by fit, performance, cost, availability, and reliability, not price alone.
- **Allies:** mutually trusted connections for repeat rentals. "Ask an Ally" sends a direct request that continues into the normal chat and offer flow. Allies get no guaranteed availability, price, or priority.
- **Transparent pricing:** full price breakdown before commitment, with charges calculated only from trusted server-side usage records.
- **Cancellation recovery:** refunds for undelivered compute, plus replacement matching when a host cancels or fails.
- **Secure execution:** isolated workloads, short-lived credentials, and a host agent that never exposes the host's files or secrets.

## How It Works

1. A user signs up to rent compute, provide compute, or both.
2. A host installs the host agent, which detects hardware and runs benchmarks. Listings are verified before going live.
3. A renter browses listings, posts a request, or uses **Ask an Ally**.
4. Renter and host chat and exchange structured offers.
5. An accepted offer creates a booking with the agreed terms and cancellation policy.
6. Before the session, the host agent runs a readiness check.
7. The platform starts an isolated environment and meters billable usage.
8. The session ends, billing is reconciled against actual delivery, and both sides can leave reviews.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend API | FastAPI (Python) |
| Database | PostgreSQL, SQLAlchemy, Alembic |
| Queue / cache | Redis |
| Real-time | WebSockets |
| Host agent | Go (or Python) |
| Execution | Hardened rootless containers (VM isolation planned) |
| Storage | S3-compatible object storage |
| Payments | Provider-agnostic interface (sandbox mode by default) |
| Testing | pytest, Playwright |
| Local dev | Docker Compose |

## Architecture

```text
Renter / Host Web App
        |
        v
Backend API + Authentication
        |
        +---- PostgreSQL (users, listings, requests, offers,
        |                 bookings, usage records, ledger, reviews)
        +---- WebSocket messaging (chat, offers, status)
        +---- Matching and scheduling service
        |        |
        |        v
        |     Job queue / coordinator
        |        |
        |        v
        |     Authenticated host agent
        |        |
        |        v
        |     Isolated GPU workload
        +---- Billing and payment provider
        +---- Object storage (datasets, outputs, checkpoints)
```

The control plane (accounts, bookings, scheduling, billing) is kept separate from workload execution. A renter's workload must never be able to reach control-plane secrets or another renter's data.

## Project Structure

```text
bidwatt/
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # FastAPI backend
├── agent/                # Host agent (Go)
├── infra/                # Docker, deployment, IaC
├── docs/                 # Schema, API, threat model, runbook
├── scripts/              # Seed data and utilities
├── docker-compose.yml
├── .env.example
└── README.md
```

> Adjust paths to match your actual layout.

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ and npm or pnpm
- Python 3.11+
- Go 1.22+ (only if you are working on the host agent)
- An NVIDIA GPU with drivers and the NVIDIA Container Toolkit (only for running the host agent)

### 1. Clone and configure

```bash
git clone https://github.com/<your-org>/bidwatt.git
cd bidwatt
cp .env.example .env
```

Edit `.env` and set your secrets (see [Configuration](#configuration)).

### 2. Start the services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, the API, and the web app.

### 3. Run database migrations

```bash
docker compose exec api alembic upgrade head
```

### 4. Seed sample data (optional)

```bash
docker compose exec api python scripts/seed.py
```

### 5. Open the app

- Web app: http://localhost:3000
- API docs: http://localhost:8000/docs

### Running without Docker

```bash
# API
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Web
cd apps/web
npm install
npm run dev
```

### Running the host agent (development)

```bash
cd agent
go build -o bidwatt-agent ./cmd/agent
./bidwatt-agent enroll --token <ONE_TIME_TOKEN> --server http://localhost:8000
./bidwatt-agent run
```

Generate the one-time enrollment token from the host dashboard. Only run the agent on a machine you control and are comfortable using for testing.

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `PAYMENT_PROVIDER` | Payment provider adapter name (default: `sandbox`) |
| `PAYMENT_API_KEY` | Provider API key (sandbox key for development) |
| `PAYMENT_WEBHOOK_SECRET` | Used to verify payment webhook signatures |
| `PLATFORM_COMMISSION_PERCENT` | Platform commission (default: `15`) |
| `S3_ENDPOINT` / `S3_BUCKET` | Object storage settings |
| `EMAIL_SMTP_URL` | SMTP settings for email notifications |
| `ALLY_UNLOCK_RULE` | When users can send Ally requests (for example `completed_booking`) |

Never commit `.env` or any real secrets.

## Running Tests

```bash
# API
docker compose exec api pytest

# Web end-to-end
cd apps/web && npx playwright test

# Host agent
cd agent && go test ./...
```

Key test areas include offer races (simultaneous accepts), offer expiry, tampering with accepted terms, illegal state transitions, webhook idempotency, ledger balancing, and isolation/escape attempts.

## Booking States

```text
OFFER_PENDING -> BOOKING_CONFIRMED -> HOST_PREPARING -> READY_TO_START
    -> RUNNING -> COMPLETED

Any state may also move to: CANCELLED, FAILED, REFUND_PENDING, REFUNDED, DISPUTED
```

Every transition is validated server-side and records a timestamp and the responsible actor.

## Security

Security is a core requirement, not a later add-on.

- Renters never get unrestricted access to the host OS. Sessions go through a platform proxy.
- Workloads run in isolated, resource-limited, rootless environments with no host mounts.
- Containers alone are not a sufficient boundary for untrusted workloads, so VM-based isolation is planned for higher-risk use.
- Host agents authenticate with the control plane over encrypted channels using short-lived credentials.
- Billing is calculated from signed, server-side usage records, never from browser timers or client-submitted values.
- Abuse reporting, rate limiting, and security logging are built in.

**Do not run untrusted workloads on a machine holding personal or sensitive data until a security review has been completed.**

To report a vulnerability, email **security@your-domain.example** instead of opening a public issue.

## Roadmap

- [x] **Phase 1:** Accounts, verified listings, request board, chat, offers, bookings, Allies
- [ ] **Phase 2:** Host agent, benchmarks, isolated execution, metering, billing, refunds (controlled pilot)
- [ ] **Phase 3:** Replacement matching, checkpointing, reliability rankings, automated payouts, abuse detection
- [ ] **Phase 4:** Guaranteed replacement plan, reserved compute, inference API, team accounts

Update the checkboxes as phases are completed.

## Known Limitations and Open Questions

- Host and renter supply and demand are unvalidated.
- Consumer GPU economics (electricity, wear, downtime) need validation.
- Payment provider capabilities for split payouts, holds, and refunds must be confirmed before launch.
- Tax, consumer-protection, and marketplace regulations have not been reviewed.
- Laptop support is experimental. Desktop NVIDIA GPUs on Linux are supported first.
- Bidwatt does not claim to be cheaper than other GPU providers.

## Contributing

1. Fork the repo and create a feature branch.
2. Before implementing a feature, write down the user flow, DB changes, API endpoints, state transitions, validation, failure cases, and security implications.
3. Add tests, especially for state machines and anything involving money.
4. Open a pull request with a clear description.

## License

Choose a license (for example MIT or Apache-2.0) and add a `LICENSE` file. Until then, all rights are reserved.
