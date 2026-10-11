import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { formatINR } from "@/lib/pricing";
import { PageTitle, SignInPrompt } from "@/components/SignInPrompt";

export const Route = createFileRoute("/allies")({
  validateSearch: (s: Record<string, unknown>) => ({ request: typeof s.request === "string" ? s.request : undefined }),
  head: () => ({
    meta: [
      { title: "Allies — Bidwatt" },
      { name: "description", content: "People you trust on Bidwatt. Ask them directly for GPU time." },
      { property: "og:title", content: "Allies — Bidwatt" },
      { property: "og:description", content: "People you trust on Bidwatt." },
    ],
  }),
  component: Allies,
});

type AllyView = { devices?: { gpu_model: string; vram_gb: number; hourly_rate_inr: number }[]; available?: boolean; completed?: number } | null;

function Allies() {
  const { user, ready } = useSession();
  const { request } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  const q = useQuery({
    queryKey: ["allies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [links, asks, mutes, reqs] = await Promise.all([
        supabase.from("ally_links").select("*, requester:profiles!ally_links_requester_id_fkey(display_name), addressee:profiles!ally_links_addressee_id_fkey(display_name)"),
        supabase.from("ally_requests").select("*, sender:profiles!ally_requests_sender_id_fkey(display_name), recipient:profiles!ally_requests_recipient_id_fkey(display_name), request:gpu_requests(title)").order("created_at", { ascending: false }),
        supabase.from("ally_mutes").select("muted_id"),
        supabase.from("gpu_requests").select("id,title").eq("renter_id", user!.id).eq("status", "open"),
      ]);
      const accepted = (links.data ?? []).filter((l) => l.status === "accepted");
      const views: Record<string, AllyView> = {};
      await Promise.all(accepted.map(async (l) => {
        const other = l.requester_id === user!.id ? l.addressee_id : l.requester_id;
        const { data } = await supabase.rpc("ally_view", { _other: other });
        views[other] = data as AllyView;
      }));
      return { links: links.data ?? [], asks: asks.data ?? [], mutes: (mutes.data ?? []).map((m) => m.muted_id), myRequests: reqs.data ?? [], views };
    },
  });
  const [reqId, setReqId] = useState<string | undefined>(request);

  if (!ready) return null;
  if (!user) return <SignInPrompt what="manage your Allies" />;
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["allies"] });
  const otherOf = (l: NonNullable<typeof d>["links"][number]) => l.requester_id === user.id
    ? { id: l.addressee_id, name: l.addressee?.display_name } : { id: l.requester_id, name: l.requester?.display_name };
  const allies = d?.links.filter((l) => l.status === "accepted") ?? [];
  const incoming = d?.links.filter((l) => l.status === "pending" && l.addressee_id === user.id) ?? [];
  const outgoing = d?.links.filter((l) => l.status === "pending" && l.requester_id === user.id) ?? [];

  async function call<T extends Parameters<typeof supabase.rpc>[0]>(fn: T, args: Parameters<typeof supabase.rpc<T>>[1], ok?: string) {
    const { data, error } = await supabase.rpc(fn, args as never);
    if (error) toast.error(error.message); else if (ok) toast.success(ok);
    refresh();
    return { data, error };
  }
  async function mute(id: string, on: boolean) {
    if (on) await supabase.from("ally_mutes").insert({ user_id: user!.id, muted_id: id });
    else await supabase.from("ally_mutes").delete().eq("muted_id", id);
    refresh();
  }
  async function ask() {
    const r = await call("ask_allies", { _recipients: picked, _message: msg.trim(), _request: reqId ?? undefined }, "Request sent to your Allies");
    if (!r.error) { setPicked([]); setMsg(""); }
  }
  async function respondAsk(id: string, accept: boolean) {
    const { data, error } = await call("respond_ally_ask", { _ask: id, _accept: accept });
    if (!error && data) navigate({ to: "/chat/$id", params: { id: data as string } });
  }
  const state = (a: { status: string; expires_at: string }) => (a.status === "sent" && new Date(a.expires_at) <= new Date() ? "expired" : a.status);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <PageTitle kicker="Trusted people" title="Allies" />
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Allies are people you've chatted with who agreed to connect. Asking an Ally opens a normal chat — no automatic bookings, no guaranteed price or priority,
        and the same protections as everyone else. Contact details and machine details are never shared.
      </p>

      {incoming.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold">Ally requests</h2>
          <ul className="mt-3 space-y-2">
            {incoming.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg border border-primary/50 bg-card p-3">
                <span>{l.requester?.display_name}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => call("respond_ally", { _link: l.id, _accept: true }, "Ally added")}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => call("respond_ally", { _link: l.id, _accept: false })}>Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-semibold">Your Allies ({allies.length})</h2>
        {allies.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No Allies yet. After chatting with someone, use "Add as Ally" in the chat menu.</p>}
        <ul className="mt-3 space-y-2">
          {allies.map((l) => {
            const o = otherOf(l);
            const v = d?.views[o.id];
            const muted = d?.mutes.includes(o.id);
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <label className="flex items-center gap-3">
                  <Checkbox checked={picked.includes(o.id)} onCheckedChange={(c) => setPicked(c ? [...picked, o.id] : picked.filter((x) => x !== o.id))} />
                  <div>
                    <div className="font-semibold">{o.name} {muted && <span className="font-mono text-xs text-muted-foreground">muted</span>}</div>
                    <div className="text-xs text-muted-foreground">
                      {v?.available !== undefined && (v.available ? "Has a GPU available · " : "No GPU available · ")}
                      {v?.completed !== undefined && `${v.completed} completed rentals · `}
                      {v?.devices?.map((x) => `${x.gpu_model} ${x.vram_gb}GB @ ${formatINR(Number(x.hourly_rate_inr))}/hr`).join(", ")}
                    </div>
                  </div>
                </label>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => mute(o.id, !muted)}>{muted ? "Unmute" : "Mute"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => call("remove_ally", { _other: o.id }, "Ally removed")}>Remove</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Block ${o.name}?`) && call("block_user", { _target: o.id }, "Blocked")}>Block</Button>
                </div>
              </li>
            );
          })}
        </ul>
        {outgoing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Waiting on: {outgoing.map((l) => l.addressee?.display_name).join(", ")}</p>}
      </section>

      {allies.length > 0 && (
        <section className="mt-8 rounded-lg border border-border p-5">
          <h2 className="font-semibold">Ask an Ally</h2>
          <p className="text-xs text-muted-foreground">Select Allies above ({picked.length} selected). They can reply in chat or decline. Requests expire after 48 hours.</p>
          <select value={reqId ?? ""} onChange={(e) => setReqId(e.target.value || undefined)} className="mt-3 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Not linked to a posted request</option>
            {d?.myRequests.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
          <Textarea className="mt-3" rows={3} maxLength={1000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Need ~8 GB VRAM for 3 hours tonight, budget around ₹50." />
          <Button className="mt-3" disabled={!picked.length || !msg.trim()} onClick={ask}>Send to {picked.length || ""} {picked.length === 1 ? "Ally" : "Allies"}</Button>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-semibold">Direct requests</h2>
        <ul className="mt-3 space-y-2">
          {d?.asks.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          {d?.asks.map((a) => {
            const incomingAsk = a.recipient_id === user.id;
            const st = state(a);
            return (
              <li key={a.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{incomingAsk ? `From ${a.sender?.display_name}` : `To ${a.recipient?.display_name}`}</span>
                  <span className="font-mono text-xs uppercase text-primary">{st}</span>
                </div>
                {a.request && <div className="text-xs text-muted-foreground">Re: {a.request.title}</div>}
                <p className="mt-1 whitespace-pre-wrap">{a.message}</p>
                {incomingAsk && st === "sent" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => respondAsk(a.id, true)}>Reply in chat</Button>
                    <Button size="sm" variant="ghost" onClick={() => respondAsk(a.id, false)}>Can't help</Button>
                  </div>
                )}
                {a.conversation_id && st !== "sent" && (
                  <Button size="sm" variant="link" className="px-0" onClick={() => navigate({ to: "/chat/$id", params: { id: a.conversation_id! } })}>Open chat</Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
