import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BidwattLogo } from "./BidwattLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { NotificationBell } from "./NotificationBell";

const nav = [
  { to: "/requests", label: "Requests" },
  { to: "/chat", label: "Chats" },
  { to: "/bookings", label: "Bookings" },
  { to: "/allies", label: "Allies" },
  { to: "/hosting", label: "Hosting" },
] as const;

export function SiteHeader() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-bold tracking-tight text-foreground hover:opacity-95"
        >
          <BidwattLogo size={24} className="shadow-sm" />
          <span className="text-base tracking-tight font-extrabold text-white">Bidwatt</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {nav
            .filter((n) => user || n.to === "/requests")
            .map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="px-2 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          {ready && user ? (
            <>
              <NotificationBell userId={user.id} />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await qc.cancelQueries();
                  qc.clear();
                  await supabase.auth.signOut();
                  navigate({ to: "/", replace: true });
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
