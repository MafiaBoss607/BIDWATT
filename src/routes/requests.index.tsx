import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { requestsQuery } from "@/lib/requests";
import { RequestCard } from "@/components/RequestCard";

export const Route = createFileRoute("/requests/")({
  head: () => ({
    meta: [
      { title: "Open GPU requests — Bidwatt" },
      { name: "description", content: "Browse what renters need right now and respond if your GPU fits." },
      { property: "og:title", content: "Open GPU requests — Bidwatt" },
      { property: "og:description", content: "Browse what renters need right now and respond if your GPU fits." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(requestsQuery),
  component: RequestsPage,
});

function RequestsPage() {
  const { data } = useSuspenseQuery(requestsQuery);
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Request board</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Open requests</h1>
        </div>
        <Button asChild><Link to="/requests/new">Post a request</Link></Button>
      </div>
      {data.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">No open requests yet. Be the first to post one.</p>
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((r) => <RequestCard key={r.id} r={r} />)}
        </div>
      )}
    </main>
  );
}
