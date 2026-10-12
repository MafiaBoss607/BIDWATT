import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Terminal, Shield, Copy, Check, Cpu, RefreshCw, Power } from "lucide-react";
import { generateEnrollmentToken } from "@/lib/agent-control";

interface DeviceEnrollmentProps {
  hostId: string;
  onEnrolled?: () => void;
}

export function DeviceEnrollmentCard({ hostId, onEnrolled }: DeviceEnrollmentProps) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("Ubuntu-RTX4090-Rig");

  async function handleGenerateToken() {
    setGenerating(true);
    try {
      const generated = generateEnrollmentToken(hostId, deviceLabel);

      const { error } = await supabase.from("agent_enrollment_tokens").insert({
        host_id: hostId,
        token_hash: generated.tokenHash,
        device_label: deviceLabel,
        expires_at: generated.expiresAt.toISOString(),
        status: "active",
      });

      if (error) throw error;

      setToken(generated.token);
      toast.success("One-time enrollment token generated (valid for 1 hour)");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate token");
    } finally {
      setGenerating(false);
    }
  }

  function copyInstallCommand() {
    if (!token) return;
    const cmd = `curl -sSL https://get.bidwatt.in/agent.sh | sudo bash -s -- --enroll "${token}"`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success("Enrollment command copied to clipboard!");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <Cpu className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Linux NVIDIA Agent Enrollment</h2>
            <p className="text-xs text-muted-foreground">
              Install the Bidwatt Host Daemon on your Linux GPU rig.
            </p>
          </div>
        </div>
        <span className="font-mono text-xs rounded-full bg-primary/10 px-2.5 py-1 text-primary">
          v1.2-daemon
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {!token ? (
          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="block text-muted-foreground mb-1">Machine Identifier / Label</label>
              <input
                type="text"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="e.g. Ubuntu-RTX4090-Rig"
                className="w-full max-w-sm rounded border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <Button size="sm" onClick={handleGenerateToken} disabled={generating} className="gap-2">
              <Shield className="h-4 w-4" />
              {generating ? "Generating Token..." : "Generate One-Time Enrollment Command"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Run this single command in your Linux terminal to authenticate, benchmark, and enroll your machine:
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs overflow-x-auto">
              <code className="text-primary truncate mr-4">
                curl -sSL https://get.bidwatt.in/agent.sh | sudo bash -s -- --enroll "{token}"
              </code>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={copyInstallCommand}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              • Token expires in 60 minutes.
              <br />
              • Automatically discovers NVIDIA GPUs via NVML, runs matrix benchmarks, and establishes encrypted telemetry.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
