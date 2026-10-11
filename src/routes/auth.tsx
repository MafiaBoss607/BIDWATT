import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/lib/use-session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Bidwatt" },
      { name: "description", content: "Sign in or create your Bidwatt account to rent or host GPUs." },
      { property: "og:title", content: "Sign in — Bidwatt" },
      { property: "og:description", content: "Sign in or create your Bidwatt account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { user } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate({ to: "/requests" });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
      });
      if (error) toast.error(error.message); else setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-3xl font-bold">{mode === "in" ? "Welcome back" : "Create account"}</h1>
      {sent ? (
        <p className="mt-6 text-muted-foreground">Check {email} for a confirmation link, then sign in.</p>
      ) : (
        <>
          <div className="mt-8 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-primary">⚡ Quick Sign-In (Real accounts on Supabase):</p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const { error } = await supabase.auth.signInWithPassword({
                    email: "bw-test-mocy2k-r@example.com",
                    password: "Pw-mocy2k-r-x9!",
                  });
                  if (error) toast.error(error.message);
                  else { toast.success("Signed in as Renter (Alice)"); navigate({ to: "/requests" }); }
                  setBusy(false);
                }}
              >
                Sign in as Renter
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const { error } = await supabase.auth.signInWithPassword({
                    email: "bw-test-mocy2k-h@example.com",
                    password: "Pw-mocy2k-h-x9!",
                  });
                  if (error) toast.error(error.message);
                  else { toast.success("Signed in as Host (Bob)"); navigate({ to: "/hosting" }); }
                  setBusy(false);
                }}
              >
                Sign in as Host
              </Button>
            </div>
          </div>
          <Button variant="outline" className="mt-4 w-full" onClick={google}>Continue with Google</Button>
          <div className="my-6 text-center font-mono text-xs text-muted-foreground">OR</div>
          <form onSubmit={submit} className="space-y-4">
            {mode === "up" && (
              <div><Label htmlFor="n">Display name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} /></div>
            )}
            <div><Label htmlFor="e">Email</Label><Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div><Label htmlFor="p">Password</Label><Input id="p" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
          </form>
          <button className="mt-4 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </>
      )}
    </main>
  );
}
