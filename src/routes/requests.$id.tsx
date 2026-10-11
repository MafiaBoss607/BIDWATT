import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { requestQuery, requestState } from "@/lib/requests";
import { useSession } from "@/lib/use-session";
import { formatINR, hourlyRate } from "@/lib/pricing";
import { rankHosts, type HostStats } from "@/lib/matching";
import { Spec } from "@/components/RequestCard";

export const Route = createFileRoute("/requests/$id")({
  loader: async ({ context, params }) => {
    const r = await context.queryClient.ensureQueryData(requestQuery(params.id));
    if (!r) throw notFound();
    return { title: r.title };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.title} — Bidwatt request` : "Request — Bidwatt";
    return {
      meta: [
        { title: t },
        { name: "description", content: "A renter's GPU request on Bidwatt. Respond if your hardware fits." },
        { property: "og:title", content: t },
        { property: "og:description", content: "A renter's GPU request on Bidwatt." },
      ],
    };
  },
  notFoundComponent: () => <main className="mx-auto max-w-md py-24 text-center">This request doesn't exist.</main>,
  component: RequestDetail,
});

function RequestDetail() {
  const { id } = Route.useParams();
  const { data: r } = useSuspenseQuery(requestQuery(id));
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isOwner = !!user && user.id === r!.renter_id;

  const matches = useQuery({
    queryKey: ["matches", id],
    enabled: isOwner,
    queryFn: async () => {
      const { data: devices, error } = await supabase
        .from("host_devices").select("*, host:profiles!host_devices_host_id_fkey(display_name)")
        .gte("vram_gb", r!.min_vram_gb).neq("host_id", r!.renter_id).limit(200);
      if (error) throw error;
      const hostIds = [...new Set(devices.map((d) => d.host_id))];
      const { data: stats } = hostIds.length ? await supabase.rpc("host_stats", { _hosts: hostIds }) : { data: [] };
      const map: Record<string, HostStats> = {};
      (stats ?? []).forEach((s) => (map[s.host_id] = s));
      const ranked = rankHosts({ ...r!, duration_hours: Number(r!.duration_hours) }, devices.map((d) => ({ ...d, hourly_rate_inr: Number(d.hourly_rate_inr) })), map);
      return ranked.slice(0, 10).map((m) => ({ ...m, host: devices.find((d) => d.id === m.device.id)!.host, stats: map[m.device.host_id] }));
    },
  });

  if (!r) return null;
  const hrs = Number(r.duration_hours);
  const state = requestState(r);

  async function openChat(other: string) {
    const { data, error } = await supabase.rpc("start_conversation", { _other: other, _request: id });
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/chat/$id", params: { id: data } });
  }

  async function close() {
    const { error } = await supabase.from("gpu_requests").update({ status: "closed" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link to="/requests" className="font-mono text-xs text-muted-foreground hover:text-foreground">← All requests</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{r.title}</h1>
        <span className="font-mono text-3xl font-bold text-primary">
          {formatINR(r.budget_inr)}{r.budget_max_inr ? `–${formatINR(r.budget_max_inr)}` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        by {r.renter?.display_name} · {state} · closes {new Date(r.expires_at).toLocaleDateString("en-IN")}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-4">
        <Spec label="Min VRAM" value={`${r.min_vram_gb} GB`} />
        <Spec label="Duration" value={`${hrs} h`} />
        <Spec label="≈ per hour" value={formatINR(hourlyRate(r.budget_inr, hrs))} />
        <Spec label="GPU" value={r.preferred_gpu ? `${r.preferred_gpu}${r.gpu_flexible ? " / similar" : ""}` : "Any"} />
        <Spec label="Runtime" value={r.runtime || "Any"} />
        <Spec label="Start by" value={r.start_by ? new Date(r.start_by).toLocaleString("en-IN") : "Flexible"} />
        <Spec label="Interruptions" value={r.interruption_ok ? "OK" : "Not OK"} />
        <Spec label="Storage" value={r.storage_gb ? `${r.storage_gb} GB` : "—"} />
      </div>
      {r.bandwidth_note && <p className="mt-3 text-sm text-muted-foreground">Bandwidth: {r.bandwidth_note}</p>}
      {r.details && <p className="mt-4 whitespace-pre-wrap text-muted-foreground">{r.details}</p>}

      <section className="mt-10">
        {!user ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-muted-foreground">Have a GPU that fits? Sign in to make an offer.</p>
            <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>
          </div>
        ) : isOwner ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">Best-matching hosts</h2>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm"><Link to="/allies" search={{ request: id }}>Ask an Ally</Link></Button>
                {state === "Open" && <Button variant="outline" size="sm" onClick={close}>Close request</Button>}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Ranked by fit, performance, cost, availability and reliability — not price alone.</p>
            <ul className="mt-4 space-y-3">
              {matches.data?.length === 0 && <p className="text-sm text-muted-foreground">No listed hosts match yet. Hosts browsing the board can still message you.</p>}
              {matches.data?.map((m, i) => (
                <li key={m.device.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
                  <div>
                    <div className="font-mono text-xs text-primary">#{i + 1} · score {Math.round(m.score * 100)}</div>
                    <div className="font-semibold">{m.device.gpu_model} · {m.device.vram_gb} GB</div>
                    <div className="text-xs text-muted-foreground">
                      {m.host?.display_name} · {formatINR(m.device.hourly_rate_inr)}/hr · est. {formatINR(m.est_total_inr)}
                      {!m.within_budget && " (over budget)"} · {m.device.available ? "available" : "busy"} · {m.stats?.completed ?? 0} completed
                    </div>
                  </div>
                  <Button size="sm" onClick={() => openChat(m.device.host_id)}>Message host</Button>
                </li>
              ))}
            </ul>
          </>
        ) : state === "Open" ? (
          <div className="rounded-lg border border-primary/40 bg-card p-6">
            <h2 className="text-xl font-semibold">Can your GPU do this?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open a chat with the renter, talk it through and send a structured offer.</p>
            <Button className="mt-4" onClick={() => openChat(r.renter_id)}>Message renter</Button>
          </div>
        ) : (
          <p className="text-muted-foreground">This request is {state.toLowerCase()}.</p>
        )}
      </section>
    </main>
  );
}
