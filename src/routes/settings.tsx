import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { PageTitle, SignInPrompt } from "@/components/SignInPrompt";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Privacy & notifications — Bidwatt" },
      { name: "description", content: "Control what your Allies can see and how you're notified." },
      { property: "og:title", content: "Privacy & notifications — Bidwatt" },
      { property: "og:description", content: "Control what your Allies can see." },
    ],
  }),
  component: Settings,
});

const FIELDS = [
  ["allies_see_devices", "Allies can see my GPU list and rates"],
  ["allies_see_availability", "Allies can see whether I have a GPU available"],
  ["allies_see_completed_count", "Allies can see how many rentals I've completed"],
  ["email_notifications", "Email me about offers and bookings"],
] as const;

function Settings() {
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["privacy", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("privacy_settings").select("*").eq("user_id", user!.id).maybeSingle();
      return data ?? { user_id: user!.id, allies_see_devices: true, allies_see_availability: true, allies_see_completed_count: true, email_notifications: true };
    },
  });
  if (!ready) return null;
  if (!user) return <SignInPrompt what="change settings" />;

  async function set(k: (typeof FIELDS)[number][0], v: boolean) {
    const { error } = await supabase.from("privacy_settings").upsert({ ...q.data!, [k]: v });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["privacy"] });
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <PageTitle kicker="Settings" title="Privacy & notifications" />
      <div className="mt-8 space-y-5">
        {q.data && FIELDS.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <Label htmlFor={k}>{label}</Label>
            <Switch id={k} checked={q.data[k]} onCheckedChange={(c) => set(k, c)} />
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted-foreground">Your email, phone, IP address and machine details are never shown to anyone, including Allies.</p>
    </main>
  );
}
