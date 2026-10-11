import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const requestsQuery = queryOptions({
  queryKey: ["requests"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("gpu_requests")
      .select("*, renter:profiles!gpu_requests_renter_id_fkey(display_name)")
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },
});

export const requestQuery = (id: string) =>
  queryOptions({
    queryKey: ["request", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gpu_requests")
        .select("*, renter:profiles!gpu_requests_renter_id_fkey(display_name)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export function requestState(r: { status: string; expires_at: string }) {
  if (r.status === "closed") return "Closed";
  return new Date(r.expires_at).getTime() <= Date.now() ? "Expired" : "Open";
}
