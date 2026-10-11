import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { estimateTotal, type BillingUnit } from "@/lib/offers";
import { formatINR } from "@/lib/pricing";

export type OfferRow = {
  id: string; gpu_model: string; min_specs: string; vram_gb: number; start_at: string; duration_hours: number;
  billing_unit: string; unit_price_inr: number; runtime: string; interruption_allowed: boolean; storage_terms: string;
  bandwidth_terms: string; cancellation_terms: string;
};

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function OfferForm({ conversationId, base, open, onOpenChange, onDone }: {
  conversationId: string; base?: OfferRow | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const start = base ? new Date(base.start_at) : new Date(Date.now() + 3 * 3600000);
  const [f, setF] = useState(() => ({
    gpu: base?.gpu_model ?? "", specs: base?.min_specs ?? "", vram: String(base?.vram_gb ?? 8), start: local(start),
    hours: String(base?.duration_hours ?? 3), unit: (base?.billing_unit ?? "hour") as BillingUnit, price: String(base?.unit_price_inr ?? 15),
    runtime: base?.runtime ?? "", interruption: base?.interruption_allowed ?? false, storage: base?.storage_terms ?? "",
    bandwidth: base?.bandwidth_terms ?? "", cancel: base?.cancellation_terms ?? "Full refund if cancelled before start; pro-rated if the host fails mid-session.",
    expiresMins: "60",
  }));
  const [busy, setBusy] = useState(false);
  const total = estimateTotal(f.unit, Number(f.price) || 0, Number(f.hours) || 0);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const startAt = new Date(f.start);
    const expires = new Date(Math.min(Date.now() + Number(f.expiresMins) * 60000, startAt.getTime()));
    const { error } = await supabase.rpc("create_offer", {
      _conversation: conversationId, _gpu_model: f.gpu.trim(), _min_specs: f.specs.trim(), _vram_gb: Number(f.vram),
      _start_at: startAt.toISOString(), _duration_hours: Number(f.hours), _billing_unit: f.unit, _unit_price_inr: Number(f.price),
      _runtime: f.runtime.trim(), _interruption_allowed: f.interruption, _storage_terms: f.storage.trim(),
      _bandwidth_terms: f.bandwidth.trim(), _cancellation_terms: f.cancel.trim(), _expires_at: expires.toISOString(),
      _supersedes: base?.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-auto">
        <DialogHeader><DialogTitle>{base ? "Counter-offer" : "New offer"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="o-g">GPU</Label><Input id="o-g" required value={f.gpu} onChange={set("gpu")} placeholder="RTX 3060 or better" /></div>
          <div><Label htmlFor="o-v">VRAM (GB)</Label><Input id="o-v" type="number" min={1} max={192} value={f.vram} onChange={set("vram")} /></div>
          <div className="col-span-2"><Label htmlFor="o-s">Minimum specs</Label><Input id="o-s" value={f.specs} onChange={set("specs")} placeholder="16 GB RAM, 8 cores" /></div>
          <div><Label htmlFor="o-st">Start</Label><Input id="o-st" type="datetime-local" required value={f.start} onChange={set("start")} /></div>
          <div><Label htmlFor="o-h">Duration (h)</Label><Input id="o-h" type="number" step="0.25" min={0.25} value={f.hours} onChange={set("hours")} /></div>
          <div>
            <Label htmlFor="o-u">Billing unit</Label>
            <select id="o-u" value={f.unit} onChange={set("unit")} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="minute">Per minute</option><option value="hour">Per hour</option><option value="session">Per session</option>
            </select>
          </div>
          <div><Label htmlFor="o-p">Price (₹/{f.unit})</Label><Input id="o-p" type="number" min={0.01} step="0.01" value={f.price} onChange={set("price")} /></div>
          <div className="col-span-2"><Label htmlFor="o-r">Runtime requirements</Label><Input id="o-r" value={f.runtime} onChange={set("runtime")} placeholder="Docker image, PyTorch 2, CUDA 12" /></div>
          <div><Label htmlFor="o-sto">Storage terms</Label><Input id="o-sto" value={f.storage} onChange={set("storage")} placeholder="20 GB, wiped after" /></div>
          <div><Label htmlFor="o-bw">Bandwidth terms</Label><Input id="o-bw" value={f.bandwidth} onChange={set("bandwidth")} placeholder="10 GB in/out" /></div>
          <div className="col-span-2"><Label htmlFor="o-c">Cancellation / failure terms</Label><Input id="o-c" value={f.cancel} onChange={set("cancel")} /></div>
          <div className="flex items-center gap-2"><Switch id="o-i" checked={f.interruption} onCheckedChange={(c) => setF({ ...f, interruption: c })} /><Label htmlFor="o-i">Interruptions allowed</Label></div>
          <div>
            <Label htmlFor="o-e">Offer expires in</Label>
            <select id="o-e" value={f.expiresMins} onChange={set("expiresMins")} className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="15">15 minutes</option><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option>
            </select>
          </div>
          <div className="col-span-2 rounded-md border border-border bg-muted p-3 font-mono text-sm">Estimated total: <span className="text-primary">{formatINR(total)}</span></div>
          <Button type="submit" disabled={busy} className="col-span-2">{base ? "Send counter-offer" : "Send offer"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
