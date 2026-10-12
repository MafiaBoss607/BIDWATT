# Bidwatt Pilot Runbook & Operational Architecture

## 1. Environment & Pre-requisites
- **Control Plane**: Node.js 20+ / Docker runtime.
- **Database**: PostgreSQL 15+ with pg_stat_statements and automated WAL archiving.
- **Host Agent Target**: Linux x86_64 with NVIDIA Driver >= 535, Docker 24+, and NVIDIA Container Toolkit.

---

## 2. Pilot Onboarding Workflow

### Host Onboarding:
1. Host registers account via Phone/Email OTP in the Bidwatt portal.
2. In Host Dashboard, click **"Enroll Machine"** to generate a single-use token (valid 15 minutes).
3. Host runs installer script:
   ```bash
   curl -sSL https://get.bidwatt.in/install.sh | bash -s -- --token <ONE_TIME_TOKEN>
   ```
4. Agent daemon starts, performs hardware detection & GPU benchmark, and streams result to control plane.
5. Host machine enters **"provisional"** status with 100 baseline reliability score.

### Renter Workload Deployment:
1. Renter posts GPU request or accepts Host listing.
2. Booking confirmed with UPI / Card hold (Razorpay sandbox / production).
3. Pre-session readiness check confirms:
   - Host heartbeat alive (<30s).
   - VRAM free, Docker runtime healthy, temperatures < 80°C.
4. Renter connects through managed SSH proxy or Jupyter Notebook tunnel.

---

## 3. Disaster Recovery & Failure Handling

### Scenario A: Host Cancellation Before Session
- **Notice > 2 Hours**: 100% refund triggered instantly to Renter. No penalty on Host.
- **Notice < 2 Hours (Last-minute)**: 100% refund triggered. Host penalized -6.0 reliability score. Replacement matching automatically launched to suggest online alternate hosts.

### Scenario B: Hardware Failure Mid-Session
- Host heartbeat timeout (>60s) or container crash detected.
- Control plane halts billing immediately.
- Renter is billed *only* for verified delivered minutes; unused prepaid funds refunded.
- Renter given choice:
  1. Accept compatible replacement host with checkpoint resumption.
  2. Take immediate 100% refund of remaining balance.

---

## 4. Moderation & Abuse Escalation Runbook

### Suspected Sandbox Escape or Unauthorized Mining:
1. System flags container via eBPF / seccomp alert or network egress violation.
2. Daemon sends SIGKILL to container, wipes scratch volume (`/var/run/bidwatt/scratch`).
3. Incident logged in `abuse_reports` table.
4. Moderator reviews incident in Admin Queue; host or renter account suspended if malicious.

---

## 5. Backup & Restore Procedures
- **Database Backup**: Nightly pg_dump cron job to S3/Cloud Storage bucket:
  ```bash
  pg_dump -U bidwatt_user -d bidwatt -Fc | gzip > /backups/bidwatt_$(date +%F).dump.gz
  ```
- **Point-in-Time Recovery**: Retain 7-day WAL logs for financial ledger and usage record reconciliation.
