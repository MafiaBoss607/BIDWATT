import React, { useState } from "react";
import { Star, ShieldAlert, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type ReplacementMatch } from "@/lib/reliability";

interface TrustAndReviewPanelProps {
  bookingId: string;
  isHost: boolean;
  onReviewSubmitted?: () => void;
  replacementMatches?: ReplacementMatch[];
  onSelectReplacement?: (match: ReplacementMatch) => void;
  onRequestRefund?: () => void;
}

export function TrustAndReviewPanel({
  bookingId,
  isHost,
  onReviewSubmitted,
  replacementMatches = [],
  onSelectReplacement,
  onRequestRefund,
}: TrustAndReviewPanelProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("hardware_spoofing");
  const [reportEvidence, setReportEvidence] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg("Review submitted successfully! Thank you for maintaining marketplace trust.");
    if (onReviewSubmitted) onReviewSubmitted();
  };

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg("Security incident / abuse report submitted to the Moderation Queue.");
    setReportOpen(false);
  };

  return (
    <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
      {/* Replacement Options Section if present */}
      {replacementMatches.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Replacement Options (Non-Guaranteed Recovery)</span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            The previous session failed. You can accept a compatible replacement host below or
            receive an immediate, full refund.
          </p>

          <div className="mt-4 space-y-3">
            {replacementMatches.map((match) => (
              <div
                key={match.deviceId}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div>
                  <div className="font-medium text-white">{match.gpuModel}</div>
                  <div className="text-xs text-zinc-400">
                    ₹{match.hourlyPriceInr}/hr{" "}
                    {match.isWithinBudget ? "(Within budget)" : `(+₹${match.priceDeltaInr} delta)`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-600/40 text-emerald-400 hover:bg-emerald-950"
                  onClick={() => onSelectReplacement && onSelectReplacement(match)}
                >
                  Switch to Host
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onRequestRefund && onRequestRefund()}
            >
              Decline & Request Instant Refund
            </Button>
          </div>
        </div>
      )}

      {/* 2-Way Review Form */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="text-base font-semibold text-white">
          Leave a Review for {isHost ? "Renter" : "Host"}
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          Reviews are public and update host reliability metrics and reputation.
        </p>

        <form onSubmit={handleSubmitReview} className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Rating:</span>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                onClick={() => setRating(star)}
                className="p-1 focus:outline-none"
              >
                <Star
                  className={`h-5 w-5 ${
                    star <= rating ? "fill-amber-400 text-amber-400" : "text-zinc-600"
                  }`}
                />
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Share feedback on hardware performance, connection stability, or communication..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="border-zinc-800 bg-zinc-900 text-sm text-zinc-200"
            rows={3}
            required
          />

          <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500">
            Submit Review
          </Button>
        </form>
      </div>

      {/* Abuse Reporting & Escalation */}
      <div className="flex items-center justify-between border-t border-zinc-800 pt-4 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-500" />
          <span>Experiencing abuse, unauthorized mining, or spoofed hardware?</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
          onClick={() => setReportOpen(!reportOpen)}
        >
          Report Violation
        </Button>
      </div>

      {reportOpen && (
        <form
          onSubmit={handleSubmitReport}
          className="rounded-lg border border-rose-900/30 bg-rose-950/20 p-4 space-y-3"
        >
          <div className="font-medium text-rose-300 text-sm">
            Submit Abuse or Dispute Escalation
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Violation Category</label>
            <select
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-200"
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
            >
              <option value="sandbox_escape_attempt">Sandbox Escape Attempt</option>
              <option value="mining_unauthorized">Unauthorized Crypto Mining</option>
              <option value="credential_harvesting">
                Credential Harvesting / Network Snooping
              </option>
              <option value="hardware_spoofing">Hardware Spoofing / Benchmarking Fraud</option>
              <option value="abusive_cancellation">Abusive Cancellations</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Evidence Summary & Log Snippets
            </label>
            <Textarea
              placeholder="Paste relevant timestamps, error logs, or evidence..."
              value={reportEvidence}
              onChange={(e) => setReportEvidence(e.target.value)}
              className="border-zinc-800 bg-zinc-900 text-xs text-zinc-200"
              rows={3}
              required
            />
          </div>
          <Button type="submit" size="sm" variant="destructive">
            Submit to Moderation Queue
          </Button>
        </form>
      )}

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
          <CheckCircle className="h-4 w-4" />
          <span>{statusMsg}</span>
        </div>
      )}
    </div>
  );
}
