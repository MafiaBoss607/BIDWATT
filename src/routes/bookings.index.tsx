import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { formatINR } from "@/lib/pricing";
import { PageTitle, SignInPrompt } from "@/components/SignInPrompt";

export const Route = createFileRoute("/bookings/")({
  head: () => ({
    meta: [
      { title: "Bookings — Bidwatt" },
      { name: "description", content: "Your confirmed GPU rentals and their status." },
      { property: "og:title", content: "Bookings — Bidwatt" },
      { property: "og:description", content: "Your confirmed GPU rentals and their status." },
    ],
  }),
  component: Bookings,
});

function Bookings() {
  const { user, ready } = useSession();
  const q = useQuery({
    queryKey: ["bookings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select("*, offer:offers(gpu_model, est_total_inr, start_at), renter:profiles!bookings_renter_id_fkey(display_name), host:profiles!bookings_host_id_fkey(display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (!ready) return null;
  if (!user) return <SignInPrompt what="see your bookings" />;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <PageTitle kicker="Rentals" title="Bookings" />
      <ul className="mt-8 space-y-3">
        {q.data?.length === 0 && <p className="text-sm text-muted-foreground">No bookings yet. Accept an offer in a chat to create one.</p>}
        {q.data?.map((b) => (
          <li key={b.id}>
            <Link to="/bookings/$id" params={{ id: b.id }} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary">
              <div>
                <div className="font-semibold">{b.offer?.gpu_model}</div>
                <div className="text-xs text-muted-foreground">
                  {b.renter_id === user.id ? `Host: ${b.host?.display_name}` : `Renter: ${b.renter?.display_name}`} · {b.offer && new Date(b.offer.start_at).toLocaleString("en-IN")}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-primary">{b.state.replace(/_/g, " ")}</div>
                <div className="font-mono text-sm">{b.offer && formatINR(Number(b.offer.est_total_inr))}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
