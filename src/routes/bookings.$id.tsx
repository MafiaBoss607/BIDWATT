import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { SignInPrompt } from "@/components/SignInPrompt";
import { OfferCard, type FullOffer } from "@/components/OfferCard";

export const Route = createFileRoute("/bookings/$id")({
  head: () => ({
    meta: [
      { title: "Booking — Bidwatt" },
      { name: "description", content: "Booking status and history." },
      { property: "og:title", content: "Booking — Bidwatt" },
      { property: "og:description", content: "Booking status and history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookingPage,
});

const LABEL: Record<string, string> = {
  HOST_PREPARING: "Start preparing", READY_TO_START: "Mark ready", RUNNING: "Start session", COMPLETED: "Mark completed",
  CANCELLED: "Cancel", FAILED: "Report failure", DISPUTED: "Open dispute", REFUND_PENDING: "Request refund", REFUNDED: "Mark refunded",
};

function BookingPage() {
  const { id } = Route.useParams();
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["booking", id],
    enabled: !!user,
    queryFn: async () => {
      const [b, ev, tr] = await Promise.all([
        supabase.from("bookings").select("*, offer:offers(*)").eq("id", id).maybeSingle(),
        supabase.from("booking_events").select("*, actor:profiles(display_name)").eq("booking_id", id).order("id"),
        supabase.from("booking_transitions").select("*"),
      ]);
      if (b.error) throw b.error;
      return { b: b.data, events: ev.data ?? [], transitions: tr.data ?? [] };
    },
  });
  useEffect(() => {
    const ch = supabase.channel(`booking-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["booking", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  if (!ready) return null;
  if (!user) return <SignInPrompt what="see this booking" />;
  if (!q.data) return null;
  const { b, events, transitions } = q.data;
  if (!b) return <main className="mx-auto max-w-md py-24 text-center text-muted-foreground">Booking not found.</main>;
  const role = b.host_id === user.id ? "host" : "renter";
  const allowed = transitions.filter((t) => t.from_state === b.state && (t.actor === "either" || t.actor === role));

  async function go(to: string) {
    const note = ["CANCELLED", "FAILED", "DISPUTED"].includes(to) ? prompt("Add a short note (optional)") ?? "" : "";
    const { error } = await supabase.rpc("transition_booking", { _booking: id, _to: to, _note: note });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["booking", id] });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/bookings" className="font-mono text-xs text-muted-foreground hover:text-foreground">← Bookings</Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Booking</h1>
        <span className="rounded-md border border-primary px-3 py-1 font-mono text-sm text-primary">{b.state.replace(/_/g, " ")}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">You are the {role}. <Link to="/chat/$id" params={{ id: b.conversation_id }} className="underline">Open chat</Link></p>
      <div className="mt-6 flex flex-wrap gap-2">
        {allowed.map((t) => (
          <Button key={t.to_state} variant={["CANCELLED", "FAILED", "DISPUTED"].includes(t.to_state) ? "outline" : "default"} onClick={() => go(t.to_state)}>
            {LABEL[t.to_state] ?? t.to_state}
          </Button>
        ))}
        {allowed.length === 0 && <p className="text-sm text-muted-foreground">Nothing for you to do right now.</p>}
      </div>
      {["REFUND_PENDING", "REFUNDED"].includes(b.state) && (
        <p className="mt-3 text-xs text-muted-foreground">Payments aren't connected yet, so refunds are tracked here but no money moves.</p>
      )}
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">Locked terms</h2>
          {b.offer && <OfferCard o={b.offer as unknown as FullOffer} me={user.id} onAccept={() => {}} onReject={() => {}} onCounter={() => {}} onWithdraw={() => {}} />}
        </section>
        <section>
          <h2 className="mb-3 font-semibold">History</h2>
          <ol className="space-y-3 border-l border-border pl-4">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="font-mono text-xs text-primary">{e.from_state.replace(/_/g, " ")} → {e.to_state.replace(/_/g, " ")}</div>
                <div className="text-xs text-muted-foreground">{e.actor?.display_name ?? "System"} · {new Date(e.at).toLocaleString("en-IN")}</div>
                {e.note && <div className="text-xs">{e.note}</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
