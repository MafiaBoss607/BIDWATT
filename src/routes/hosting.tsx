import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { formatINR } from "@/lib/pricing";
import { PageTitle, SignInPrompt } from "@/components/SignInPrompt";

export const Route = createFileRoute("/hosting")({
  head: () => ({
    meta: [
      { title: "Your GPUs — Bidwatt hosting" },
      { name: "description", content: "List the GPUs you can rent out and set your hourly rate." },
      { property: "og:title", content: "Your GPUs — Bidwatt hosting" },
      { property: "og:description", content: "List the GPUs you can rent out on Bidwatt." },
    ],
  }),
  component: Hosting,
});

function Hosting() {
  const { user, ready } = useSession();
  const qc = useQueryClient();
  const [f, setF] = useState({ gpu: "", vram: "12", ram: "16", bench: "", rate: "20", runtimes: "PyTorch, CUDA 12" });
  const q = useQuery({
    queryKey: ["my-devices", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("host_devices").select("*").eq("host_id", user!.id).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  if (!ready) return null;
  if (!user) return <SignInPrompt what="list your GPUs" />;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("host_devices").insert({
      host_id: user!.id, gpu_model: f.gpu.trim(), vram_gb: Number(f.vram), ram_gb: Number(f.ram),
      benchmark_score: Number(f.bench) || 0, hourly_rate_inr: Number(f.rate),
      runtimes: f.runtimes.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
    });
    if (error) { toast.error(error.message); return; }
    setF({ ...f, gpu: "" });
    qc.invalidateQueries({ queryKey: ["my-devices"] });
  }
  async function toggle(id: string, available: boolean) {
    await supabase.from("host_devices").update({ available }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["my-devices"] });
  }
  async function remove(id: string) {
    await supabase.from("host_devices").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["my-devices"] });
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <PageTitle kicker="Hosting" title="Your GPUs" />
      <p className="mt-2 text-sm text-muted-foreground">Only the GPU model and specs are shown to renters — never your IP address, location or machine details.</p>
      <ul className="mt-8 space-y-3">
        {q.data?.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div>
              <div className="font-semibold">{d.gpu_model} · {d.vram_gb} GB {d.verified ? <span className="font-mono text-xs text-primary">verified</span> : <span className="font-mono text-xs text-muted-foreground">unverified</span>}</div>
              <div className="text-xs text-muted-foreground">{d.ram_gb} GB RAM · bench {d.benchmark_score} · {formatINR(Number(d.hourly_rate_inr))}/hr · {d.runtimes.join(", ")}</div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={d.available} onCheckedChange={(c) => toggle(d.id, c)} aria-label="Available" />
              <span className="text-xs">{d.available ? "Available" : "Busy"}</span>
              <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>Remove</Button>
            </div>
          </li>
        ))}
        {q.data?.length === 0 && <p className="text-sm text-muted-foreground">No GPUs listed yet.</p>}
      </ul>
      <form onSubmit={add} className="mt-10 grid gap-4 rounded-lg border border-border p-5 sm:grid-cols-3">
        <div className="sm:col-span-3 text-lg font-semibold">Add a GPU</div>
        <div><Label htmlFor="g">GPU model</Label><Input id="g" required minLength={2} value={f.gpu} onChange={set("gpu")} placeholder="RTX 3060" /></div>
        <div><Label htmlFor="v">VRAM (GB)</Label><Input id="v" type="number" min={1} max={192} value={f.vram} onChange={set("vram")} /></div>
        <div><Label htmlFor="r">System RAM (GB)</Label><Input id="r" type="number" min={1} value={f.ram} onChange={set("ram")} /></div>
        <div><Label htmlFor="b">Benchmark score</Label><Input id="b" type="number" min={0} value={f.bench} onChange={set("bench")} placeholder="self-reported" /></div>
        <div><Label htmlFor="p">Rate (₹/hour)</Label><Input id="p" type="number" min={0.5} step="0.5" value={f.rate} onChange={set("rate")} /></div>
        <div><Label htmlFor="rt">Runtimes</Label><Input id="rt" value={f.runtimes} onChange={set("runtimes")} /></div>
        <Button type="submit" className="sm:col-span-3 sm:w-fit">Add GPU</Button>
      </form>
    </main>
  );
}
