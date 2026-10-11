import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { formatINR, hourlyRate, validateRequest } from "@/lib/pricing";
import { SignInPrompt } from "@/components/SignInPrompt";

export const Route = createFileRoute("/requests/new")({
  head: () => ({
    meta: [
      { title: "Post a GPU request — Bidwatt" },
      { name: "description", content: "Describe the compute you need and your budget in rupees. Hosts will respond." },
      { property: "og:title", content: "Post a GPU request — Bidwatt" },
      { property: "og:description", content: "Describe the compute you need and your budget in rupees." },
    ],
  }),
  component: NewRequest,
});

function NewRequest() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: "", details: "", vram: "8", hours: "3", budget: "50", budgetMax: "", gpu: "", flexible: true,
    runtime: "", startBy: "", interruption: false, storage: "0", bandwidth: "", expiresDays: "7",
  });
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (!user) return <SignInPrompt what="post a request" />;

  const input = { title: f.title, min_vram_gb: Number(f.vram), duration_hours: Number(f.hours), budget_inr: Number(f.budget) };
  const max = f.budgetMax ? Number(f.budgetMax) : null;
  const err = validateRequest(input) ?? (max !== null && (!Number.isInteger(max) || max < input.budget_inr) ? "Maximum budget must be a whole number at least the minimum." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (err) { toast.error(err); return; }
    setBusy(true);
    const { data, error } = await supabase
      .from("gpu_requests")
      .insert({
        ...input, title: f.title.trim(), details: f.details.trim(), preferred_gpu: f.gpu.trim(), gpu_flexible: f.flexible,
        renter_id: user!.id, budget_max_inr: max, runtime: f.runtime.trim(), interruption_ok: f.interruption,
        storage_gb: Number(f.storage) || 0, bandwidth_note: f.bandwidth.trim(),
        start_by: f.startBy ? new Date(f.startBy).toISOString() : null,
        expires_at: new Date(Date.now() + Number(f.expiresDays) * 86400000).toISOString(),
      })
      .select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["requests"] });
    navigate({ to: "/requests/$id", params: { id: data.id } });
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">What do you need?</h1>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <div><Label htmlFor="t">Workload</Label><Input id="t" value={f.title} onChange={set("title")} placeholder="Fine-tune a 7B model with LoRA" maxLength={120} /></div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><Label htmlFor="v">Min VRAM (GB)</Label><Input id="v" type="number" min={1} max={192} value={f.vram} onChange={set("vram")} /></div>
          <div><Label htmlFor="h">Hours</Label><Input id="h" type="number" step="0.25" min={0.25} max={720} value={f.hours} onChange={set("hours")} /></div>
          <div><Label htmlFor="b">Budget min (₹)</Label><Input id="b" type="number" min={1} step={1} value={f.budget} onChange={set("budget")} /></div>
          <div><Label htmlFor="bm">Budget max (₹)</Label><Input id="bm" type="number" min={1} step={1} value={f.budgetMax} onChange={set("budgetMax")} placeholder="optional" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label htmlFor="rt">Preferred runtime</Label><Input id="rt" value={f.runtime} onChange={set("runtime")} placeholder="PyTorch 2 + CUDA 12" maxLength={80} /></div>
          <div><Label htmlFor="sb">Start by</Label><Input id="sb" type="datetime-local" value={f.startBy} onChange={set("startBy")} /></div>
          <div><Label htmlFor="g">Preferred GPU</Label><Input id="g" value={f.gpu} onChange={set("gpu")} placeholder="RTX 3060" maxLength={80} /></div>
          <div><Label htmlFor="st">Storage needed (GB)</Label><Input id="st" type="number" min={0} value={f.storage} onChange={set("storage")} /></div>
        </div>
        <div><Label htmlFor="bw">Bandwidth expectations</Label><Input id="bw" value={f.bandwidth} onChange={set("bandwidth")} placeholder="Upload ~5 GB dataset" maxLength={200} /></div>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-3"><Switch id="fl" checked={f.flexible} onCheckedChange={(c) => setF({ ...f, flexible: c })} /><Label htmlFor="fl">Flexible on GPU model</Label></div>
          <div className="flex items-center gap-3"><Switch id="in" checked={f.interruption} onCheckedChange={(c) => setF({ ...f, interruption: c })} /><Label htmlFor="in">OK if interrupted</Label></div>
        </div>
        <div>
          <Label htmlFor="ex">Request closes after</Label>
          <select id="ex" value={f.expiresDays} onChange={set("expiresDays")} className="mt-1 block h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option>
          </select>
        </div>
        <div><Label htmlFor="d">Details</Label><Textarea id="d" rows={3} value={f.details} onChange={set("details")} maxLength={2000} placeholder="Frameworks, dataset size…" /></div>
        <div className="rounded-lg border border-border bg-card p-4 font-mono text-sm">
          {err ? <span className="text-destructive">{err}</span> : (
            <>Offering <span className="text-primary">{formatINR(input.budget_inr)}{max ? `–${formatINR(max)}` : ""}</span> · about {formatINR(hourlyRate(input.budget_inr, input.duration_hours))}/hr</>
          )}
        </div>
        <Button type="submit" variant="hero" size="lg" disabled={busy || !!err}>Post request</Button>
      </form>
    </main>
  );
}
