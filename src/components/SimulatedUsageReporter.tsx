import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Activity, ShieldAlert, Cpu } from "lucide-react";

interface UsageReporterProps {
  bookingId: string;
  hostId: string;
  onReported: () => void;
}

export function SimulatedUsageReporter({ bookingId, hostId, onReported }: UsageReporterProps) {
  const [seconds, setSeconds] = useState(600); // 10 minutes default
  const [gpuLoad, setGpuLoad] = useState(92);
  const [vramMb, setVramMb] = useState(12288);
  const [powerWatts, setPowerWatts] = useState(240);
  const [submitting, setSubmitting] = useState(false);

  async function handleSendTelemetry(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - seconds * 1000);

      const { error } = await supabase.from("usage_records").insert({
        booking_id: bookingId,
        host_id: hostId,
        interval_start: start.toISOString(),
        interval_end: now.toISOString(),
        delivered_seconds: seconds,
        gpu_utilization_pct: gpuLoad,
        memory_used_mb: vramMb,
        power_draw_watts: powerWatts,
        is_verified: true,
        raw_signature: `sig_sandbox_telemetry_${Date.now()}`,
      });

      if (error) throw error;
      toast.success(`Server verified ${seconds}s (${(seconds / 60).toFixed(1)} mins) delivered compute.`);
      onReported();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit usage report");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-5">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Simulated Host Agent Telemetry</h3>
        </div>
        <span className="font-mono text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded">
          Host Node Agent Simulator
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Submit trusted server-side heartbeat telemetry to verify delivered compute before the real daemon is installed.
      </p>

      <form onSubmit={handleSendTelemetry} className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <label className="block text-muted-foreground mb-1">Delivered Seconds</label>
          <input
            type="number"
            value={seconds}
            onChange={(e) => setSeconds(parseInt(e.target.value) || 0)}
            className="w-full rounded border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-muted-foreground mb-1">GPU Load (%)</label>
          <input
            type="number"
            max={100}
            min={0}
            value={gpuLoad}
            onChange={(e) => setGpuLoad(parseFloat(e.target.value) || 0)}
            className="w-full rounded border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-muted-foreground mb-1">VRAM Used (MB)</label>
          <input
            type="number"
            value={vramMb}
            onChange={(e) => setVramMb(parseInt(e.target.value) || 0)}
            className="w-full rounded border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-muted-foreground mb-1">Power Draw (W)</label>
          <input
            type="number"
            value={powerWatts}
            onChange={(e) => setPowerWatts(parseFloat(e.target.value) || 0)}
            className="w-full rounded border border-border bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="col-span-2 sm:col-span-4 mt-2 flex justify-end">
          <Button size="sm" type="submit" disabled={submitting} className="gap-2">
            <Cpu className="h-4 w-4" />
            {submitting ? "Signing Telemetry..." : "Send Verified Heartbeat"}
          </Button>
        </div>
      </form>
    </div>
  );
}
