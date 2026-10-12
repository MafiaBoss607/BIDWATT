import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Security Hardening: In-Memory Token Bucket Rate Limiter
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const memoryBuckets = new Map<string, RateLimitBucket>();

export interface RateLimitConfig {
  maxTokens: number;
  refillRatePerSec: number;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = { maxTokens: 30, refillRatePerSec: 1 },
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let bucket = memoryBuckets.get(key);

  if (!bucket) {
    bucket = { tokens: config.maxTokens, lastRefill: now };
    memoryBuckets.set(key, bucket);
  }

  // Refill tokens
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + elapsedSec * config.refillRatePerSec);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }

  return { allowed: false, remaining: 0 };
}

// ---------------------------------------------------------------------------
// Privacy-Preserving Security Logger (Minimal Personal Data)
// ---------------------------------------------------------------------------

export interface SecurityEvent {
  action: string;
  userId?: string;
  ipAddress?: string;
  bookingId?: string;
  metadata?: Record<string, unknown>;
}

export interface SanitizedAuditLog {
  timestamp: string;
  action: string;
  anonymizedActorId: string;
  maskedIp: string;
  bookingId?: string;
  details: string;
}

/**
 * Strips PII, hashes user identifiers for privacy, masks IP address,
 * and yields safe audit trails compliant with data minimization.
 */
export function recordSecurityAudit(event: SecurityEvent): SanitizedAuditLog {
  const anonymizedActor = event.userId
    ? `usr_${createHash("sha256").update(event.userId).digest("hex").slice(0, 12)}`
    : "anonymous";

  const maskedIp = event.ipAddress ? event.ipAddress.replace(/\.\d+\.\d+$/, ".xxx.xxx") : "hidden";

  return {
    timestamp: new Date().toISOString(),
    action: event.action,
    anonymizedActorId: anonymizedActor,
    maskedIp,
    bookingId: event.bookingId,
    details: JSON.stringify(event.metadata ?? {}),
  };
}
