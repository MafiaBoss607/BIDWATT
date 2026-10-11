import { Link } from "@tanstack/react-router";
import { formatINR, hourlyRate } from "@/lib/pricing";

type R = {
  id: string; title: string; min_vram_gb: number; duration_hours: number; budget_inr: number;
  preferred_gpu: string; gpu_flexible: boolean; renter: { display_name: string } | null;
};

export function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

export function RequestCard({ r }: { r: R }) {
  const hrs = Number(r.duration_hours);
  return (
    <Link to="/requests/$id" params={{ id: r.id }} className="group block rounded-lg border border-border bg-card p-5 transition-all hover:border-primary hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold leading-snug group-hover:text-primary">{r.title}</h2>
        <span className="shrink-0 font-mono text-lg font-bold text-primary">{formatINR(r.budget_inr)}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Spec label="VRAM" value={`${r.min_vram_gb} GB+`} />
        <Spec label="Time" value={`${hrs} h`} />
        <Spec label="≈ / hr" value={formatINR(hourlyRate(r.budget_inr, hrs))} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {r.preferred_gpu ? `${r.preferred_gpu}${r.gpu_flexible ? " or similar" : " only"}` : "Any GPU model"} · by {r.renter?.display_name ?? "someone"}
      </p>
    </Link>
  );
}
