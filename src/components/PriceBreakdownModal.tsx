import { useState } from "react";
import { formatINR, calculatePriceBreakdown, type PriceBreakdown } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Info, AlertTriangle, ArrowRight } from "lucide-react";

interface PriceBreakdownModalProps {
  unitPriceInr: number;
  billingUnit: "minute" | "hour" | "session";
  durationHours: number;
  storageTerms?: string;
  bandwidthTerms?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmAndAuthorize: (breakdown: PriceBreakdown) => void;
  isAuthorizing?: boolean;
}

export function PriceBreakdownModal({
  unitPriceInr,
  billingUnit,
  durationHours,
  storageTerms,
  bandwidthTerms,
  isOpen,
  onClose,
  onConfirmAndAuthorize,
  isAuthorizing = false,
}: PriceBreakdownModalProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  if (!isOpen) return null;

  const breakdown = calculatePriceBreakdown({
    unitPriceInr,
    billingUnit,
    durationHours,
    storageTerms,
    bandwidthTerms,
    commissionRatePct: 15,
    isIdleBillable: false,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Pre-Commitment Price Breakdown</h2>
            <p className="text-xs text-muted-foreground">Clear Indian Rupee (INR) cost disclosure before payment hold</p>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            Sandbox Verified
          </span>
        </div>

        <div className="mt-4 space-y-3 font-mono text-xs">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Compute Unit Rate</span>
            <span>{formatINR(breakdown.unitPriceInr)} / {breakdown.billingUnit}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Committed Duration</span>
            <span>{breakdown.durationHours} hours</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Estimated Compute Subtotal</span>
            <span className="font-semibold">{formatINR(breakdown.computeTotalInr)}</span>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Fee & Earnings Split (15% Commission)
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Host Receives (85%)</span>
              <span className="text-emerald-500 font-medium">{formatINR(breakdown.hostReceivableInr)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Bidwatt Platform Fee (15%)</span>
              <span>{formatINR(breakdown.platformFeeInr)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>GST on Platform Fee (18% of fee)</span>
              <span>{formatINR(breakdown.gstOnFeeInr)}</span>
            </div>
          </div>

          {storageTerms && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Storage Terms</span>
              <span className="text-right truncate max-w-[200px]">{storageTerms}</span>
            </div>
          )}
          {bandwidthTerms && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Bandwidth Terms</span>
              <span className="text-right truncate max-w-[200px]">{bandwidthTerms}</span>
            </div>
          )}

          <div className="flex justify-between border-t border-border pt-3 text-sm">
            <span className="font-bold">Total Payable by Renter</span>
            <span className="font-bold text-primary text-base">{formatINR(breakdown.totalPayableByRenterInr)}</span>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex gap-2.5 items-start">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {breakdown.failurePolicyNotice}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="agreeTerms"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <label htmlFor="agreeTerms" className="text-xs text-muted-foreground cursor-pointer select-none">
            I understand that funds will be held in sandbox and charged strictly for delivered compute seconds.
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isAuthorizing}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!agreedToTerms || isAuthorizing}
            onClick={() => onConfirmAndAuthorize(breakdown)}
            className="gap-2"
          >
            {isAuthorizing ? "Authorizing Hold..." : "Authorize & Confirm Booking"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
