import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function SignInPrompt({ what }: { what: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">Sign in to {what}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Select a role or sign in with your account to start interacting with the marketplace.</p>
      <div className="mt-6 flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={async () => {
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.signInWithPassword({
                email: "bw-test-mocy2k-r@example.com",
                password: "Pw-mocy2k-r-x9!",
              });
              window.location.reload();
            }}
          >
            Quick Sign In: Renter
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.signInWithPassword({
                email: "bw-test-mocy2k-h@example.com",
                password: "Pw-mocy2k-h-x9!",
              });
              window.location.reload();
            }}
          >
            Quick Sign In: Host
          </Button>
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-2"><Link to="/auth">Sign in with email / Google</Link></Button>
      </div>
    </main>
  );
}

export function PageTitle({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">{kicker}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">{title}</h1>
      </div>
      {children}
    </div>
  );
}
