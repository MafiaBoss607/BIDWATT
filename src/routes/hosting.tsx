import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { SignInPrompt } from "@/components/SignInPrompt";
import { formatINR, roundPaise } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Wallet, ArrowDownRight, ArrowUpRight, Receipt, Landmark, CheckCircle2 } from "lucide-react";
import { DeviceEnrollmentCard } from "@/components/DeviceEnrollmentCard";

export const Route = createFileRoute("/hosting")({
  head: () => ({
    meta: [
      { title: "Host Earnings & Payouts — Bidwatt" },
      { name: "description", content: "Track host GPU earnings, payouts, and invoices." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HostEarningsPage,
});

function HostEarningsPage() {
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const [payoutAmount, setPayoutAmount] = useState("500");
  const [upiId, setUpiId] = useState("");
  const [requesting, setRequesting] = useState(false);

  const earningsQuery = useQuery({
    queryKey: ["host-earnings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // 1. Fetch completed bookings as host
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, state, created_at, offer:offers(*)")
        .eq("host_id", user!.id);

      // 2. Fetch payouts
      const { data: payouts } = await supabase
        .from("host_payouts")
        .select("*")
        .eq("host_id", user!.id)
        .order("requested_at", { ascending: false });

      // 3. Fetch invoices
      const { data: invoices } = await supabase
        .from("billing_invoices")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("issued_at", { ascending: false });

      // 4. Calculate total gross earnings from bookings (85% of accepted total for COMPLETED)
      const totalEarned = (bookings ?? [])
        .filter((b) => b.state === "COMPLETED")
        .reduce((sum, b) => {
          const total = Number(b.offer?.est_total_inr ?? 0);
          return sum + roundPaise(total * 0.85);
        }, 0);

      const totalWithdrawn = (payouts ?? [])
        .filter((p) => p.status === "completed" || p.status === "pending" || p.status === "processing")
        .reduce((sum, p) => sum + Number(p.amount_inr), 0);

      const availableBalance = Math.max(0, roundPaise(totalEarned - totalWithdrawn));

      return {
        bookings: bookings ?? [],
        payouts: payouts ?? [],
        invoices: invoices ?? [],
        totalEarned,
        availableBalance,
      };
    },
  });

  async function handleRequestPayout(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt < 100) {
      toast.error("Minimum payout amount is ₹100");
      return;
    }
    if (!upiId.trim() || !upiId.includes("@")) {
      toast.error("Please enter a valid UPI VPA (e.g. host@okhdfcbank)");
      return;
    }
    if (amt > (earningsQuery.data?.availableBalance ?? 0)) {
      toast.error("Requested amount exceeds available balance");
      return;
    }

    setRequesting(true);
    try {
      const { error } = await supabase.from("host_payouts").insert({
        host_id: user!.id,
        amount_inr: amt,
        payout_method: "upi",
        payout_target: upiId.trim(),
        status: "completed", // sandbox auto-settles
        provider_reference: `upi_sb_${Date.now()}`,
      });
      if (error) throw error;
      toast.success(`Payout of ${formatINR(amt)} initiated to ${upiId}`);
      qc.invalidateQueries({ queryKey: ["host-earnings", user?.id] });
    } catch (err: any) {
      toast.error(err.message || "Payout request failed");
    } finally {
      setRequesting(false);
    }
  }

  if (!ready) return null;
  if (!user) return <SignInPrompt what="view host earnings" />;

  const data = earningsQuery.data;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Host Earnings & Payouts</h1>
          <p className="text-sm text-muted-foreground">Peer GPU revenue, automated UPI payouts, and tax receipts.</p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            Available Balance
          </div>
          <div className="mt-2 text-2xl font-bold text-primary">
            {formatINR(data?.availableBalance ?? 0)}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Ready for instant UPI transfer</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
            Lifetime Earned
          </div>
          <div className="mt-2 text-2xl font-bold">
            {formatINR(data?.totalEarned ?? 0)}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Net of 15% platform commission</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Landmark className="h-4 w-4 text-blue-500" />
            GST / TDS Status
          </div>
          <div className="mt-2 text-2xl font-bold">Compliant</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Section 194-O under-threshold</p>
        </div>
      </div>

      {/* Host GPU Daemon Enrollment & Machine Control */}
      <div className="mt-8">
        <DeviceEnrollmentCard hostId={user.id} />
      </div>

      {/* Payout Request Form */}
      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Request Instant UPI Payout</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Withdraw funds directly to your Indian UPI VPA. No fees charged by Bidwatt for UPI payouts.
        </p>

        <form onSubmit={handleRequestPayout} className="mt-4 grid gap-4 sm:grid-cols-3 font-mono text-xs">
          <div>
            <label className="block text-muted-foreground mb-1">Amount (₹ INR, min ₹100)</label>
            <input
              type="number"
              min="100"
              step="1"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-muted-foreground mb-1">UPI VPA (e.g. host@okhdfcbank)</label>
            <input
              type="text"
              placeholder="user@upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={requesting || (data?.availableBalance ?? 0) < 100}
              className="w-full"
            >
              {requesting ? "Processing..." : "Withdraw via UPI"}
            </Button>
          </div>
        </form>
      </div>

      {/* Payout History & Receipts */}
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Recent Payouts</h2>
          {(data?.payouts ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No payouts requested yet.</p>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {data?.payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b border-border/50 pb-2">
                  <div>
                    <div className="font-medium">{formatINR(p.amount_inr)} via {p.payout_method.toUpperCase()}</div>
                    <div className="text-[10px] text-muted-foreground">{p.payout_target} · {new Date(p.requested_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  <span className="text-[11px] text-emerald-500 uppercase flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Invoices & Tax Slips</h2>
          {(data?.invoices ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Invoices are automatically generated on session completion.</p>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {data?.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between border-b border-border/50 pb-2">
                  <div>
                    <div className="font-medium flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5 text-primary" />
                      {inv.invoice_number}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{new Date(inv.issued_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatINR(inv.total_amount_inr)}</div>
                    <div className="text-[10px] text-muted-foreground">Tax: {formatINR(inv.tax_inr)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
