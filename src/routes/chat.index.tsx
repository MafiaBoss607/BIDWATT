import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { PageTitle, SignInPrompt } from "@/components/SignInPrompt";

export const Route = createFileRoute("/chat/")({
  head: () => ({
    meta: [
      { title: "Chats — Bidwatt" },
      { name: "description", content: "Your negotiations with renters and hosts." },
      { property: "og:title", content: "Chats — Bidwatt" },
      { property: "og:description", content: "Your negotiations with renters and hosts." },
    ],
  }),
  component: ChatList,
});

function ChatList() {
  const { user, ready } = useSession();
  const q = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data, error }, { data: reads }] = await Promise.all([
        supabase.from("conversations")
          .select("*, renter:profiles!conversations_renter_id_fkey(display_name), host:profiles!conversations_host_id_fkey(display_name), request:gpu_requests(title)")
          .order("last_message_at", { ascending: false }),
        supabase.from("conversation_reads").select("*").eq("user_id", user!.id),
      ]);
      if (error) throw error;
      return data.map((c) => ({ ...c, unread: new Date(c.last_message_at) > new Date(reads?.find((r) => r.conversation_id === c.id)?.last_read_at ?? 0) }));
    },
  });
  if (!ready) return null;
  if (!user) return <SignInPrompt what="see your chats" />;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <PageTitle kicker="Negotiations" title="Chats" />
      <ul className="mt-8 divide-y divide-border rounded-lg border border-border">
        {q.data?.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No chats yet. Open a request to start one.</li>}
        {q.data?.map((c) => {
          const amRenter = c.renter_id === user.id;
          const other = amRenter ? c.host : c.renter;
          return (
            <li key={c.id}>
              <Link to="/chat/$id" params={{ id: c.id }} className="flex items-center justify-between gap-4 p-4 hover:bg-accent">
                <div>
                  <div className="font-semibold">{other?.display_name} <span className="font-mono text-xs text-muted-foreground">· {amRenter ? "host" : "renter"}</span></div>
                  <div className="text-xs text-muted-foreground">{c.request?.title ?? "Direct chat"}</div>
                </div>
                {c.unread && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
