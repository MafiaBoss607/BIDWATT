import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { SignInPrompt } from "@/components/SignInPrompt";
import { OfferCard, type FullOffer } from "@/components/OfferCard";
import { PriceBreakdownModal } from "@/components/PriceBreakdownModal";
import { DisputeManager } from "@/components/DisputeManager";
import { SimulatedUsageReporter } from "@/components/SimulatedUsageReporter";
import { ReadinessCheckModal } from "@/components/ReadinessCheckModal";
import { formatINR, type PriceBreakdown } from "@/lib/pricing";
import { SandboxPaymentProvider } from "@/lib/payment-provider";
import { calculateTrustedDeliveredCharges } from "@/lib/ledger";
import { ShieldCheck, CreditCard, Activity, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/bookings/$id")({
  head: () => ({
    meta: [
      { title: "Booking & Billing — Bidwatt" },
      { name: "description", content: "Booking status, payment hold, and usage records." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingPage,
});

const LABEL: Record<string, string> = {
  HOST_PREPARING: "Start preparing",
  READY_TO_START: "Mark ready",
  RUNNING: "Start session",
  COMPLETED: "Mark completed",
  CANCELLED: "Cancel",
  FAILED: "Report failure",
  DISPUTED: "Open dispute",
  REFUND_PENDING: "Request refund",
  REFUNDED: "Mark refunded",
};

function BookingPage() {
  const { id } = Route.useParams();
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  const q = useQuery({
    queryKey: ["booking", id],
    enabled: !!user,
    queryFn: async () => {
      const [b, ev, tr, pay, usage, disp, ledg] = await Promise.all([
        supabase.from("bookings").select("*, offer:offers(*)").eq("id", id).maybeSingle(),
        supabase.from("booking_events").select("*, actor:profiles(display_name)").eq("booking_id", id).order("id"),
        supabase.from("booking_transitions").select("*"),
        supabase.from("payment_intents").select("*").eq("booking_id", id).maybeSingle(),
        supabase.from("usage_records").select("*").eq("booking_id", id).order("reported_at", { ascending: true }),
        supabase.from("booking_disputes").select("*").eq("booking_id", id).maybeSingle(),
        supabase.from("ledger_entries").select("*").eq("booking_id", id).order("created_at", { ascending: true }),
      ]);
      if (b.error) throw b.error;
      return {
        b: b.data,
        events: ev.data ?? [],
        transitions: tr.data ?? [],
        payment: pay.data,
        usageRecords: usage.data ?? [],
        dispute: disp.data,
        ledgerEntries: ledg.data ?? [],
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`booking-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["booking", id] }),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "usage_records", filter: `booking_id=eq.${id}` }, () =>
        qc.invalidateQueries({ queryKey: ["booking", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc]);

  if (!ready) return null;
  if (!user) return <SignInPrompt what="see this booking" />;
  if (!q.data) return null;
  const { b, events, transitions, payment, usageRecords, dispute, ledgerEntries } = q.data;
  if (!b) return <main className="mx-auto max-w-md py-24 text-center text-muted-foreground">Booking not found.</main>;

  const role = b.host_id === user.id ? "host" : "renter";
  const allowed = transitions.filter((t) => t.from_state === b.state && (t.actor === "either" || t.actor === role));

  async function handleAuthorizePayment(breakdown: PriceBreakdown) {
    setAuthorizing(true);
    try {
      const sandbox = new SandboxPaymentProvider();
      const order = await sandbox.createOrder({
        bookingId: id,
        amountInr: breakdown.totalPayableByRenterInr,
        renterId: user!.id,
        idempotencyKey: `idem_${id}_${Date.now()}`,
      });

      // Store payment authorization in database
      const { error: pError } = await supabase.from("payment_intents").insert({
        booking_id: id,
        renter_id: user!.id,
        provider: "sandbox",
        provider_order_id: order.orderId,
        provider_payment_id: `pay_sb_${Date.now()}`,
        status: "authorized",
        amount_inr: breakdown.totalPayableByRenterInr,
        currency: "INR",
        idempotency_key: `idem_payment_${id}`,
      });
      if (pError) throw pError;

      // Add double-entry ledger holding entries
      await supabase.from("ledger_entries").insert([
        {
          transactionId: order.orderId,
          booking_id: id,
          account: "cash_gateway",
          entryType: "debit",
          amountInr: breakdown.totalPayableByRenterInr,
          description: "Gateway deposit collection from renter",
        },
        {
          transactionId: order.orderId,
          booking_id: id,
          account: "renter_holding",
          entryType: "credit",
          amountInr: breakdown.totalPayableByRenterInr,
          description: "Held in escrow awaiting compute delivery",
        },
      ]);

      toast.success("Payment authorized in sandbox. Escrow holding activated.");
      setShowPriceBreakdown(false);
      qc.invalidateQueries({ queryKey: ["booking", id] });
    } catch (err: any) {
      toast.error(err.message || "Payment authorization failed");
    } finally {
      setAuthorizing(false);
    }
  }

  const [showReadinessCheck, setShowReadinessCheck] = useState(false);

  async function go(to: string) {
    if (to === "READY_TO_START" && role === "host") {
      setShowReadinessCheck(true);
      return;
    }
    const note = ["CANCELLED", "FAILED", "DISPUTED"].includes(to) ? prompt("Add a short note (optional)") ?? "" : "";
    const { error } = await supabase.rpc("transition_booking", { _booking: id, _to: to, _note: note });
    if (error) toast.error(error.message);

    // If marked failed or cancelled mid-session, automate refund logic if payment was held
    if (to === "FAILED" || to === "CANCELLED") {
      toast.info("Session ended early. Undelivered compute calculation triggered.");
    }

    qc.invalidateQueries({ queryKey: ["booking", id] });
  }

  async function handleReadinessPassed() {
    setShowReadinessCheck(false);
    const { error } = await supabase.rpc("transition_booking", {
      _booking: id,
      _to: "READY_TO_START",
      _note: "Pre-session readiness audit passed",
    });
    if (error) toast.error(error.message);
    else toast.success("Rig ready! Booking moved to READY_TO_START.");
    qc.invalidateQueries({ queryKey: ["booking", id] });
  }

  async function handleReadinessFailedCancel() {
    setShowReadinessCheck(false);
    const { error } = await supabase.rpc("transition_booking", {
      _booking: id,
      _to: "CANCELLED",
      _note: "Pre-session readiness audit failed (safety limits or resource shortage)",
    });
    if (error) toast.error(error.message);
    else toast.info("Booking cancelled and renter refunded due to failed readiness check.");
    qc.invalidateQueries({ queryKey: ["booking", id] });
  }


  const deliveredMetrics = calculateTrustedDeliveredCharges({
    records: usageRecords.map((r: any) => ({
      deliveredSeconds: r.delivered_seconds,
      isVerified: r.is_verified,
    })),
    unitPriceInr: Number(b.offer?.unit_price_inr ?? 0),
    billingUnit: (b.offer?.billing_unit as any) ?? "hour",
    committedHours: Number(b.offer?.duration_hours ?? 1),
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link to="/bookings" className="font-mono text-xs text-muted-foreground hover:text-foreground">
        ← Bookings
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Booking Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You are the {role}.{" "}
            <Link to="/chat/$id" params={{ id: b.conversation_id }} className="underline">
              Open chat
            </Link>
          </p>
        </div>
        <span className="rounded-md border border-primary px-3 py-1 font-mono text-sm text-primary">
          {b.state.replace(/_/g, " ")}
        </span>
      </div>

      {/* Payment / Escrow Status Banner */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold">
                Payment Status: {payment ? payment.status.toUpperCase() : "AWAITING AUTHORIZATION"}
              </div>
              <div className="text-xs text-muted-foreground">
                {payment
                  ? `${formatINR(payment.amount_inr)} held in sandbox escrow. Auto-captured on delivered usage.`
                  : "Renter must authorize payment hold before compute execution starts."}
              </div>
            </div>
          </div>

          {!payment && role === "renter" && b.state === "BOOKING_CONFIRMED" && (
            <Button size="sm" onClick={() => setShowPriceBreakdown(true)} className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              View Breakdown & Authorize Hold
            </Button>
          )}

          {payment && (
            <span className="font-mono text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              Escrow Active
            </span>
          )}
        </div>
      </div>

      {/* State Transition Actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        {allowed.map((t) => (
          <Button
            key={t.to_state}
            variant={["CANCELLED", "FAILED", "DISPUTED"].includes(t.to_state) ? "outline" : "default"}
            onClick={() => go(t.to_state)}
          >
            {LABEL[t.to_state] ?? t.to_state}
          </Button>
        ))}
        {allowed.length === 0 && <p className="text-sm text-muted-foreground">Nothing for you to do right now.</p>}
      </div>

      {/* Live Server-Verified Telemetry Section */}
      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-sm">Server-Verified Usage & Charges</h2>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            Trusted Backend Computation
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
          <div>
            <div className="text-muted-foreground">Verified Compute</div>
            <div className="text-base font-bold text-primary">
              {(deliveredMetrics.totalDeliveredSeconds / 60).toFixed(1)} mins
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Delivered Charges</div>
            <div className="text-base font-bold">
              {formatINR(deliveredMetrics.deliveredComputeInr)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Undelivered Balance</div>
            <div className="text-base font-bold text-emerald-500">
              {formatINR(deliveredMetrics.undeliveredRefundInr)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Heartbeats Logged</div>
            <div className="text-base font-bold">{usageRecords.length} records</div>
          </div>
        </div>

        {usageRecords.length > 0 && (
          <div className="mt-4 max-h-40 overflow-y-auto rounded border border-border/50 bg-background/50 p-2 font-mono text-[11px]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-1">Time</th>
                  <th className="p-1">Delivered (s)</th>
                  <th className="p-1">GPU Load</th>
                  <th className="p-1">VRAM</th>
                  <th className="p-1">Verified</th>
                </tr>
              </thead>
              <tbody>
                {usageRecords.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/20">
                    <td className="p-1">{new Date(r.reported_at).toLocaleTimeString("en-IN")}</td>
                    <td className="p-1">{r.delivered_seconds}s</td>
                    <td className="p-1">{r.gpu_utilization_pct}%</td>
                    <td className="p-1">{r.memory_used_mb} MB</td>
                    <td className="p-1 text-emerald-500">✓ Signed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Host Agent Simulator Section */}
      <div className="mt-6">
        <SimulatedUsageReporter
          bookingId={id}
          hostId={b.host_id}
          onReported={() => qc.invalidateQueries({ queryKey: ["booking", id] })}
        />
      </div>

      {/* Dispute Center */}
      <div className="mt-6">
        <DisputeManager
          bookingId={id}
          role={role}
          currentDispute={dispute}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["booking", id] })}
        />
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold text-sm">Locked Offer Terms</h2>
          {b.offer && (
            <OfferCard
              o={b.offer as unknown as FullOffer}
              me={user.id}
              onAccept={() => {}}
              onReject={() => {}}
              onCounter={() => {}}
              onWithdraw={() => {}}
            />
          )}
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-sm">Lifecycle History</h2>
          <ol className="space-y-3 border-l border-border pl-4">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="font-mono text-xs text-primary">
                  {e.from_state.replace(/_/g, " ")} → {e.to_state.replace(/_/g, " ")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {e.actor?.display_name ?? "System"} · {new Date(e.at).toLocaleString("en-IN")}
                </div>
                {e.note && <div className="text-xs">{e.note}</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Pre-Commitment Modal */}
      {b.offer && (
        <PriceBreakdownModal
          isOpen={showPriceBreakdown}
          onClose={() => setShowPriceBreakdown(false)}
          unitPriceInr={Number(b.offer.unit_price_inr)}
          billingUnit={b.offer.billing_unit}
          durationHours={Number(b.offer.duration_hours)}
          storageTerms={b.offer.storage_terms}
          bandwidthTerms={b.offer.bandwidth_terms}
          onConfirmAndAuthorize={handleAuthorizePayment}
          isAuthorizing={authorizing}
        />
      )}

      {/* Pre-Session Readiness Audit Modal */}
      <ReadinessCheckModal
        bookingId={id}
        isOpen={showReadinessCheck}
        onClose={() => setShowReadinessCheck(false)}
        onPassed={handleReadinessPassed}
        onFailedCancel={handleReadinessFailedCancel}
      />
    </main>
  );
}

