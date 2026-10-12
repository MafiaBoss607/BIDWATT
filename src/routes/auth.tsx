import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Bidwatt" },
      {
        name: "description",
        content: "Sign in or create your Bidwatt account to rent or host GPUs.",
      },
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
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
      });
      if (error) toast.error(error.message);
      else setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
    }
    setBusy(false);
  }

  async function google() {
    setBusy(true);
    try {
      // Use managed Cloud Google OAuth broker (handles pre-configured Google credentials)
      const { lovable } = await import("@/integrations/lovable/index");
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/requests`,
      });

      if (r && "error" in r && r.error) {
        toast.error(r.error.message ?? "Google sign-in failed");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Google authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-3xl font-bold">{mode === "in" ? "Welcome back" : "Create account"}</h1>
      {sent ? (
        <p className="mt-6 text-muted-foreground">
          Check {email} for a confirmation link, then sign in.
        </p>
      ) : (
        <>
          <div className="mt-8 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-primary">
              ⚡ Quick Sign-In (Real accounts on Supabase):
            </p>
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
                  else {
                    toast.success("Signed in as Renter (Alice)");
                    navigate({ to: "/requests" });
                  }
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
                  else {
                    toast.success("Signed in as Host (Bob)");
                    navigate({ to: "/hosting" });
                  }
                  setBusy(false);
                }}
              >
                Sign in as Host
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full gap-2 font-medium border-border hover:bg-card hover:border-primary/40"
            disabled={busy}
            onClick={google}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </Button>
          <div className="my-6 text-center font-mono text-xs text-muted-foreground">OR</div>
          <form onSubmit={submit} className="space-y-4">
            {mode === "up" && (
              <div>
                <Label htmlFor="n">Display name</Label>
                <Input
                  id="n"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={60}
                />
              </div>
            )}
            <div>
              <Label htmlFor="e">Email</Label>
              <Input
                id="e"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="p">Password</Label>
              <Input
                id="p"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "in" ? "Sign in" : "Sign up"}
            </Button>
          </form>
          <button
            className="mt-4 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </>
      )}
    </main>
  );
}
