import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { requestsQuery } from "@/lib/requests";
import { useSession } from "@/lib/use-session";
import { SocialRequestFeed } from "@/components/SocialRequestFeed";

export const Route = createFileRoute("/requests/")({
  head: () => ({
    meta: [
      { title: "Live GPU Feed — Bidwatt" },
      {
        name: "description",
        content: "Browse live compute requests from developers and researchers.",
      },
      { property: "og:title", content: "Live GPU Feed — Bidwatt" },
      {
        property: "og:description",
        content: "Browse live compute requests from developers and researchers.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(requestsQuery),
  component: RequestsPage,
});

function RequestsPage() {
  const { data } = useSuspenseQuery(requestsQuery);
  const { user } = useSession();

  return (
    <main>
      <SocialRequestFeed requests={data} currentUserId={user?.id} />
    </main>
  );
}
