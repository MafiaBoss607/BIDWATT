import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/pricing";
import { displayStatus } from "@/lib/offers";
import type { OfferRow } from "./OfferForm";

export type FullOffer = OfferRow & {
  proposer_id: string; recipient_id: string; status: string; expires_at: string; est_total_inr: number; created_at: string; supersedes_id: string | null;
};

const statusStyle: Record<string, string> = {
  pending: "text-primary", accepted: "text-chart-2", rejected: "text-destructive", countered: "text-muted-foreground",
  expired: "text-muted-foreground", withdrawn: "text-muted-foreground",
};

export function OfferCard({ o, me, bookingId, onAccept, onReject, onCounter, onWithdraw }: {
  o: FullOffer; me: string; bookingId?: string;
  onAccept: () => void; onReject: () => void; onCounter: () => void; onWithdraw: () => void;
}) {
  const st = displayStatus(o);
  const superseded = ["countered", "withdrawn", "expired", "rejected"].includes(st);
  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-3 py-0.5"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>
  );
  return (
    <div className={`w-full max-w-md rounded-lg border bg-card p-4 font-mono text-xs ${st === "pending" ? "border-primary shadow-glow" : "border-border"} ${superseded ? "opacity-60" : ""}`}>
      <div className="mb-2 flex items-center justify-between font-display text-sm">
        <span className="font-semibold">{o.proposer_id === me ? "Your offer" : "Offer to you"}{o.supersedes_id ? " (counter)" : ""}</span>
        <span className={`uppercase ${statusStyle[st]}`}>{st}</span>
      </div>
      {row("GPU", `${o.gpu_model} · ${o.vram_gb} GB`)}
      {o.min_specs && row("Min specs", o.min_specs)}
      {row("Start", new Date(o.start_at).toLocaleString("en-IN"))}
      {row("Duration", `${Number(o.duration_hours)} h`)}
      {row("Price", `${formatINR(Number(o.unit_price_inr))} / ${o.billing_unit}`)}
      {o.runtime && row("Runtime", o.runtime)}
      {row("Interruptions", o.interruption_allowed ? "Allowed" : "Not allowed")}
      {o.storage_terms && row("Storage", o.storage_terms)}
      {o.bandwidth_terms && row("Bandwidth", o.bandwidth_terms)}
      {o.cancellation_terms && row("Cancellation", o.cancellation_terms)}
      {row("Expires", new Date(o.expires_at).toLocaleString("en-IN"))}
      <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm"><span>Estimated total</span><span className="text-primary">{formatINR(Number(o.est_total_inr))}</span></div>
      {st === "pending" && o.recipient_id === me && (
        <div className="mt-3 flex gap-2 font-display">
          <Button size="sm" onClick={onAccept}>Accept</Button>
          <Button size="sm" variant="outline" onClick={onCounter}>Counter</Button>
          <Button size="sm" variant="ghost" onClick={onReject}>Reject</Button>
        </div>
      )}
      {st === "pending" && o.proposer_id === me && (
        <div className="mt-3 flex gap-2 font-display">
          <Button size="sm" variant="outline" onClick={onCounter}>Revise</Button>
          <Button size="sm" variant="ghost" onClick={onWithdraw}>Withdraw</Button>
        </div>
      )}
      {st === "accepted" && bookingId && (
        <div className="mt-3 font-display"><Button asChild size="sm" variant="outline"><Link to="/bookings/$id" params={{ id: bookingId }}>View booking</Link></Button></div>
      )}
      {st === "accepted" && <p className="mt-2 text-[10px] text-muted-foreground">Terms are locked. Changes need a new offer accepted by both.</p>}
    </div>
  );
}
