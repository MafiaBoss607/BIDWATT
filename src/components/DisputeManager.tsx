import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { AlertCircle, FileText, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DisputeManagerProps {
  bookingId: string;
  role: "host" | "renter";
  currentDispute?: {
    id: string;
    reason: string;
    details: string;
    claimed_refund_inr: number;
    status: string;
    resolution_note?: string;
  } | null;
  onRefresh: () => void;
}

export function DisputeManager({ bookingId, role, currentDispute, onRefresh }: DisputeManagerProps) {
  const [isOpenForm, setIsOpenForm] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [claimedRefund, setClaimedRefund] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleOpenDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || !details.trim()) {
      toast.error("Please provide both a reason and detailed explanation");
      return;
    }

    setSubmitting(true);
    try {
      const { data: booking, error: bError } = await supabase
        .from("bookings")
        .select("renter_id, host_id")
        .eq("id", bookingId)
        .single();

      if (bError) throw bError;

      const { data: dispute, error } = await supabase
        .from("booking_disputes")
        .insert({
          booking_id: bookingId,
          initiator_id: (await supabase.auth.getUser()).data.user?.id,
          respondent_id: role === "renter" ? booking.host_id : booking.renter_id,
          reason,
          details,
          claimed_refund_inr: claimedRefund ? parseFloat(claimedRefund) : 0,
          status: "open",
        })
        .select()
        .single();

      if (error) throw error;

      if (evidenceUrl.trim() && dispute) {
        await supabase.from("dispute_evidence").insert({
          dispute_id: dispute.id,
          uploader_id: (await supabase.auth.getUser()).data.user?.id,
          file_url: evidenceUrl.trim(),
          description: "Initial dispute submission evidence",
        });
      }

      // Transition booking state to DISPUTED if not already
      await supabase.rpc("transition_booking", {
        _booking: bookingId,
        _to: "DISPUTED",
        _note: `Dispute opened: ${reason}`,
      });

      toast.success("Dispute opened. Support team and counterparty have been notified.");
      setIsOpenForm(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to open dispute");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdminSimulateResolution(resolution: "refund_renter" | "pay_host") {
    if (!currentDispute) return;
    setSubmitting(true);
    try {
      const newStatus = resolution === "refund_renter" ? "resolved_renter_refund" : "resolved_host_paid";
      const { error } = await supabase
        .from("booking_disputes")
        .update({
          status: newStatus,
          resolution_note: `Resolution applied: ${resolution === "refund_renter" ? "Full refund approved for renter" : "Earnings approved for host"}`,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", currentDispute.id);

      if (error) throw error;

      // Update booking accordingly
      const nextBookingState = resolution === "refund_renter" ? "REFUND_PENDING" : "COMPLETED";
      await supabase.rpc("transition_booking", {
        _booking: bookingId,
        _to: nextBookingState,
        _note: `Dispute resolved: ${newStatus}`,
      });

      toast.success(`Dispute resolved: ${newStatus}`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Resolution update failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-sm">Dispute & Resolution Center</h3>
        </div>
        {currentDispute && (
          <span className="font-mono text-xs px-2.5 py-0.5 rounded-full border border-amber-500/30 text-amber-500 bg-amber-500/10">
            {currentDispute.status.replace(/_/g, " ").toUpperCase()}
          </span>
        )}
      </div>

      {!currentDispute && !isOpenForm && (
        <div className="mt-4 text-xs text-muted-foreground space-y-3">
          <p>
            Experience an issue with host GPU performance, dropped connection, or unmet specs?
            You can file a formal dispute with uploaded telemetry evidence.
          </p>
          <Button variant="outline" size="sm" onClick={() => setIsOpenForm(true)}>
            Open Dispute
          </Button>
        </div>
      )}

      {isOpenForm && !currentDispute && (
        <form onSubmit={handleOpenDispute} className="mt-4 space-y-3 text-xs">
          <div>
            <label className="block text-muted-foreground mb-1">Reason for Dispute</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Host machine went down after 10 mins"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground mb-1">Detailed Explanation</label>
            <textarea
              required
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Provide logs, timestamps, or description of unmet agreement..."
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground mb-1">Claimed Refund Amount (₹ INR)</label>
            <input
              type="number"
              step="0.01"
              value={claimedRefund}
              onChange={(e) => setClaimedRefund(e.target.value)}
              placeholder="e.g. 50.00"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground mb-1">Evidence URL / Log Screenshot Link</label>
            <input
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://... (screenshot or log paste)"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Dispute"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpenForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {currentDispute && (
        <div className="mt-4 space-y-3 font-mono text-xs">
          <div className="rounded-lg bg-muted/40 p-3 space-y-2 border border-border">
            <div><span className="text-muted-foreground">Reason:</span> {currentDispute.reason}</div>
            <div><span className="text-muted-foreground">Details:</span> {currentDispute.details}</div>
            {currentDispute.claimed_refund_inr > 0 && (
              <div><span className="text-muted-foreground">Claimed Refund:</span> {formatINR(currentDispute.claimed_refund_inr)}</div>
            )}
            {currentDispute.resolution_note && (
              <div className="text-primary"><span className="text-muted-foreground">Resolution:</span> {currentDispute.resolution_note}</div>
            )}
          </div>

          <div className="pt-2 border-t border-border flex flex-wrap gap-2 items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Sandbox Resolution Simulators:</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={submitting || currentDispute.status.startsWith("resolved")}
                onClick={() => handleAdminSimulateResolution("refund_renter")}
              >
                Simulate Renter Refund
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={submitting || currentDispute.status.startsWith("resolved")}
                onClick={() => handleAdminSimulateResolution("pay_host")}
              >
                Simulate Host Payout
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
