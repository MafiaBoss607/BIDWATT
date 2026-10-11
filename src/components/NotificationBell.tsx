import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ["notifications", userId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  const unread = q.data?.filter((n) => !n.read_at).length ?? 0;
  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <Popover onOpenChange={(o) => { if (!o && unread) markAll(); }}>
      <PopoverTrigger className="relative rounded-md p-2 hover:bg-accent" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] text-primary-foreground">{unread}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">Notifications</div>
        <ul className="max-h-96 overflow-auto">
          {q.data?.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet.</li>}
          {q.data?.map((n) => (
            <li key={n.id} className={n.read_at ? "opacity-60" : ""}>
              <a href={n.link ?? "#"} className="block px-4 py-3 text-sm hover:bg-accent">
                <div>{n.title}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("en-IN")}</div>
              </a>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-4 py-2 text-right"><Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground">Settings</Link></div>
      </PopoverContent>
    </Popover>
  );
}
