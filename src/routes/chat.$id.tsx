import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { attachmentError } from "@/lib/offers";
import { SignInPrompt } from "@/components/SignInPrompt";
import { OfferForm, type OfferRow } from "@/components/OfferForm";
import { OfferCard, type FullOffer } from "@/components/OfferCard";

export const Route = createFileRoute("/chat/$id")({
  head: () => ({
    meta: [
      { title: "Chat — Bidwatt" },
      { name: "description", content: "Negotiate GPU rental terms." },
      { property: "og:title", content: "Chat — Bidwatt" },
      { property: "og:description", content: "Negotiate GPU rental terms." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [base, setBase] = useState<OfferRow | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const conv = useQuery({
    queryKey: ["conversation", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations")
        .select("*, renter:profiles!conversations_renter_id_fkey(display_name), host:profiles!conversations_host_id_fkey(display_name), request:gpu_requests(id,title)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const feed = useQuery({
    queryKey: ["feed", id],
    enabled: !!user,
    queryFn: async () => {
      const [m, o, b, r, bl] = await Promise.all([
        supabase.from("messages").select("*").eq("conversation_id", id).order("created_at").limit(500),
        supabase.from("offers").select("*").eq("conversation_id", id).order("created_at"),
        supabase.from("bookings").select("id, offer_id").eq("conversation_id", id),
        supabase.from("conversation_reads").select("*").eq("conversation_id", id),
        supabase.from("blocks").select("blocked_id"),
      ]);
      if (m.error) throw m.error;
      if (o.error) throw o.error;
      return { messages: m.data, offers: o.data as unknown as FullOffer[], bookings: b.data ?? [], reads: r.data ?? [], blocks: bl.data ?? [] };
    },
  });

  // Live updates over the realtime socket
  useEffect(() => {
    if (!user) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ["feed", id] });
    const ch = supabase.channel(`chat-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "offers", filter: `conversation_id=eq.${id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_reads", filter: `conversation_id=eq.${id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, user, qc]);

  // Read state
  const lastAt = feed.data?.messages.at(-1)?.created_at;
  useEffect(() => {
    if (!user || !lastAt) return;
    supabase.from("conversation_reads").upsert({ conversation_id: id, user_id: user.id, last_read_at: new Date().toISOString() }).then();
    endRef.current?.scrollIntoView({ block: "end" });
  }, [id, user, lastAt]);

  if (!ready) return null;
  if (!user) return <SignInPrompt what="chat" />;
  if (conv.isLoading) return null;
  if (!conv.data) return <main className="mx-auto max-w-md py-24 text-center text-muted-foreground">Chat not found.</main>;

  const c = conv.data;
  const amRenter = c.renter_id === user.id;
  const otherId = amRenter ? c.host_id : c.renter_id;
  const otherName = (amRenter ? c.host : c.renter)?.display_name;
  const iBlocked = feed.data?.blocks.some((b) => b.blocked_id === otherId);
  const otherRead = feed.data?.reads.find((r) => r.user_id === otherId)?.last_read_at;
  const myLast = [...(feed.data?.messages ?? [])].reverse().find((m) => m.sender_id === user.id);
  const seen = myLast && otherRead && new Date(otherRead) >= new Date(myLast.created_at);

  type Item = { kind: "m"; at: string; m: NonNullable<typeof feed.data>["messages"][number] } | { kind: "o"; at: string; o: FullOffer };
  const items: Item[] = [
    ...(feed.data?.messages ?? []).map((m) => ({ kind: "m" as const, at: m.created_at, m })),
    ...(feed.data?.offers ?? []).map((o) => ({ kind: "o" as const, at: o.created_at, o })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const refresh = () => qc.invalidateQueries({ queryKey: ["feed", id] });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const { error } = await supabase.from("messages").insert({ conversation_id: id, sender_id: user!.id, body: text.trim() });
    if (error) { toast.error(iBlocked ? "You've blocked this user." : "Message not sent — you may not be able to contact this user."); return; }
    setText("");
    refresh();
  }
  async function attach(file: File) {
    const err = attachmentError(file);
    if (err) { toast.error(err); return; }
    const path = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_").slice(0, 100)}`;
    const up = await supabase.storage.from("chat-attachments").upload(path, file, { contentType: file.type });
    if (up.error) { toast.error(up.error.message); return; }
    const { error } = await supabase.from("messages").insert({
      conversation_id: id, sender_id: user!.id, attachment_path: path, attachment_name: file.name.slice(0, 200), attachment_size: file.size, attachment_type: file.type,
    });
    if (error) toast.error(error.message); else refresh();
  }
  async function openAttachment(path: string) {
    const { data, error } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function rpc(fn: "respond_offer" | "withdraw_offer", args: Record<string, string>, ok: string) {
    const { error } = await supabase.rpc(fn as "respond_offer", args as { _offer: string; _action: string });
    if (error) toast.error(error.message); else toast.success(ok);
    refresh();
  }
  async function block() {
    if (!confirm(`Block ${otherName}? Pending offers and Ally requests between you will be cancelled.`)) return;
    const { error } = await supabase.rpc("block_user", { _target: otherId });
    if (error) toast.error(error.message); else toast.success("User blocked");
    refresh();
  }
  async function unblock() {
    await supabase.from("blocks").delete().eq("blocked_id", otherId);
    refresh();
  }
  async function addAlly() {
    const { error } = await supabase.rpc("request_ally", { _target: otherId });
    if (error) toast.error(error.message); else toast.success("Ally request sent");
  }
  async function report(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("reports").insert({ reporter_id: user!.id, target_id: otherId, conversation_id: id, reason: reason.trim() });
    if (error) { toast.error(error.message); return; }
    setReportOpen(false); setReason("");
    toast.success("Report sent. Thanks for keeping Bidwatt safe.");
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4">
      <div className="flex items-center justify-between gap-3 border-b border-border py-3">
        <div>
          <Link to="/chat" className="font-mono text-xs text-muted-foreground hover:text-foreground">← Chats</Link>
          <div className="font-semibold">{otherName} <span className="font-mono text-xs text-muted-foreground">· {amRenter ? "host" : "renter"}</span></div>
          {c.request && <Link to="/requests/$id" params={{ id: c.request.id }} className="text-xs text-muted-foreground hover:text-primary">{c.request.title}</Link>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="hero" disabled={iBlocked} onClick={() => { setBase(null); setOfferOpen(true); }}>Make offer</Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-md p-2 hover:bg-accent" aria-label="More"><MoreVertical className="h-4 w-4" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={addAlly}>Add as Ally</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReportOpen(true)}>Report</DropdownMenuItem>
              {iBlocked ? <DropdownMenuItem onClick={unblock}>Unblock</DropdownMenuItem> : <DropdownMenuItem onClick={block} className="text-destructive">Block</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-4">
        {items.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Say hi and talk through what you need. When you're ready, send an offer.</p>}
        {items.map((it) =>
          it.kind === "m" ? (
            <div key={it.m.id} className={`flex ${it.m.sender_id === user.id ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${it.m.sender_id === user.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {it.m.body && <p className="whitespace-pre-wrap">{it.m.body}</p>}
                {it.m.attachment_path && (
                  <button className="underline" onClick={() => openAttachment(it.m.attachment_path!)}>
                    📎 {it.m.attachment_name} ({Math.ceil((it.m.attachment_size ?? 0) / 1024)} KB)
                  </button>
                )}
                <div className="mt-1 font-mono text-[10px] opacity-60">{new Date(it.m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          ) : (
            <div key={it.o.id} className={`flex ${it.o.proposer_id === user.id ? "justify-end" : "justify-start"}`}>
              <OfferCard
                o={it.o} me={user.id}
                bookingId={feed.data?.bookings.find((b) => b.offer_id === it.o.id)?.id}
                onAccept={() => rpc("respond_offer", { _offer: it.o.id, _action: "accept" }, "Offer accepted — booking confirmed")}
                onReject={() => rpc("respond_offer", { _offer: it.o.id, _action: "reject" }, "Offer rejected")}
                onWithdraw={() => rpc("withdraw_offer", { _offer: it.o.id }, "Offer withdrawn")}
                onCounter={() => { setBase(it.o); setOfferOpen(true); }}
              />
            </div>
          ),
        )}
        {seen && <p className="text-right font-mono text-[10px] text-muted-foreground">Seen</p>}
        <div ref={endRef} />
      </div>

      {iBlocked ? (
        <p className="border-t border-border py-4 text-center text-sm text-muted-foreground">You blocked this user.</p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-border py-3">
          <input ref={fileRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label="Attach file (max 5 MB)"><Paperclip className="h-4 w-4" /></Button>
          <Textarea autoFocus rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Message…" className="min-h-9 resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }} />
          <Button type="submit" disabled={!text.trim()}>Send</Button>
        </form>
      )}

      {offerOpen && <OfferForm key={base?.id ?? "new"} conversationId={id} base={base} open={offerOpen} onOpenChange={setOfferOpen} onDone={refresh} />}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report {otherName}</DialogTitle></DialogHeader>
          <form onSubmit={report} className="space-y-3">
            <Textarea required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened?" />
            <Button type="submit">Send report</Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
