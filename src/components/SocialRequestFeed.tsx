import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles,
  Flame,
  Clock,
  Cpu,
  Layers,
  Send,
  MessageCircle,
  TrendingUp,
  Share2,
  Bookmark,
  Heart,
  SlidersHorizontal,
  PlusCircle,
  Radio,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, hourlyRate, validateRequest } from "@/lib/pricing";

export interface FeedRequestItem {
  id: string;
  title: string;
  details?: string | null;
  min_vram_gb: number;
  duration_hours: number;
  budget_inr: number;
  preferred_gpu?: string | null;
  gpu_flexible?: boolean | null;
  created_at: string;
  renter_id: string;
  renter: { display_name: string } | null;
}

interface SocialRequestFeedProps {
  requests: FeedRequestItem[];
  currentUserId?: string;
}

export function SocialRequestFeed({ requests, currentUserId }: SocialRequestFeedProps) {
  const [filter, setFilter] = useState<"for_you" | "trending" | "fresh">("for_you");
  const [minVramFilter, setMinVramFilter] = useState<number | "all">("all");
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [bookmarkedMap, setBookmarkedMap] = useState<Record<string, boolean>>({});

  // Quick Post modal state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerDetails, setComposerDetails] = useState("");
  const [composerVram, setComposerVram] = useState("16");
  const [composerHours, setComposerHours] = useState("4");
  const [composerBudget, setComposerBudget] = useState("120");
  const [isPosting, setIsPosting] = useState(false);

  const qc = useQueryClient();
  const navigate = useNavigate();

  // Filter items
  const filteredList = requests.filter((r) => {
    if (minVramFilter !== "all" && r.min_vram_gb < minVramFilter) {
      return false;
    }
    return true;
  });

  const sortedList = [...filteredList].sort((a, b) => {
    if (filter === "trending") {
      // High budget requests rank higher
      return b.budget_inr - a.budget_inr;
    }
    if (filter === "fresh") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // "for_you" balanced
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const toggleLike = (id: string) => {
    setLikedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleBookmark = (id: string) => {
    setBookmarkedMap((prev) => ({ ...prev, [id]: !prev[id] }));
    toast.success(!bookmarkedMap[id] ? "Saved to your bookmarks" : "Removed from bookmarks");
  };

  const handleShare = async (id: string, title: string) => {
    const url = `${window.location.origin}/requests/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Bidwatt Request: ${title}`, url });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Request link copied to clipboard!");
    }
  };

  const handleQuickPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) {
      navigate({ to: "/auth" });
      return;
    }

    const input = {
      title: composerTitle.trim(),
      min_vram_gb: Number(composerVram),
      duration_hours: Number(composerHours),
      budget_inr: Number(composerBudget),
    };

    const err = validateRequest(input);
    if (err) {
      toast.error(err);
      return;
    }

    setIsPosting(true);
    const { error } = await supabase.from("gpu_requests").insert({
      ...input,
      details: composerDetails.trim(),
      renter_id: currentUserId,
      preferred_gpu: "",
      gpu_flexible: true,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });

    setIsPosting(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Request posted live to the feed!");
    setComposerTitle("");
    setComposerDetails("");
    setComposerOpen(false);
    await qc.invalidateQueries({ queryKey: ["requests"] });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Feed Top Controls (Twitter / Facebook style tab headers) */}
      <div className="sticky top-14 z-30 -mx-4 border-b border-border bg-background/95 px-4 backdrop-blur">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setFilter("for_you")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                filter === "for_you"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              For You
            </button>
            <button
              onClick={() => setFilter("trending")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                filter === "trending"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              Top Budget
            </button>
            <button
              onClick={() => setFilter("fresh")}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                filter === "fresh"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <Radio className="h-3.5 w-3.5 animate-pulse text-amber-400" />
              Live Stream
            </button>
          </div>

          {/* VRAM Quick Filters */}
          <div className="flex items-center gap-1.5 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden text-muted-foreground sm:inline">VRAM:</span>
            {[
              { label: "All", val: "all" as const },
              { label: "16GB+", val: 16 },
              { label: "24GB+", val: 24 },
            ].map((chip) => (
              <button
                key={chip.label}
                onClick={() => setMinVramFilter(chip.val)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                  minVramFilter === chip.val
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Social Feed Quick Composer Box (Facebook / Twitter style "What compute do you need?") */}
      <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        {!composerOpen ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
              ⚡
            </div>
            <button
              onClick={() => setComposerOpen(true)}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-left text-xs text-muted-foreground hover:border-primary/50 transition-colors"
            >
              Need GPU compute? Post a request to the live stream...
            </button>
            <Button
              size="sm"
              onClick={() => setComposerOpen(true)}
              className="shrink-0 gap-1.5 text-xs"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Post
            </Button>
          </div>
        ) : (
          <form onSubmit={handleQuickPost} className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" /> Create GPU Request
              </span>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
            <Input
              placeholder="e.g. Fine-tune Llama 3 8B with LoRA tonight"
              value={composerTitle}
              onChange={(e) => setComposerTitle(e.target.value)}
              className="border-border text-xs"
              required
            />
            <Textarea
              placeholder="Details on requirements, dataset size, frameworks (optional)..."
              value={composerDetails}
              onChange={(e) => setComposerDetails(e.target.value)}
              className="border-border text-xs"
              rows={2}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Min VRAM</label>
                <Input
                  type="number"
                  value={composerVram}
                  onChange={(e) => setComposerVram(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="GB"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Duration</label>
                <Input
                  type="number"
                  value={composerHours}
                  onChange={(e) => setComposerHours(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="Hours"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Budget (₹)</label>
                <Input
                  type="number"
                  value={composerBudget}
                  onChange={(e) => setComposerBudget(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="INR"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" disabled={isPosting} className="gap-1.5 text-xs">
                <Send className="h-3 w-3" />
                {isPosting ? "Broadcasting..." : "Broadcast Request"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* The Live Feed Stream */}
      <div className="mt-6 space-y-4">
        {sortedList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Cpu className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">No requests match this view</p>
            <p className="text-xs text-muted-foreground mt-1">
              Be the first to post a new GPU compute request to the community.
            </p>
          </div>
        ) : (
          sortedList.map((r) => {
            const hrs = Number(r.duration_hours);
            const rate = hourlyRate(r.budget_inr, hrs);
            const isLiked = !!likedMap[r.id];
            const isBookmarked = !!bookmarkedMap[r.id];
            const author = r.renter?.display_name ?? "Anonymous Renter";
            const timeAgo = formatTimeAgo(r.created_at);

            return (
              <article
                key={r.id}
                className="group relative rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/60 hover:shadow-glow"
              >
                {/* Header: Author Avatar, Name, Timestamp */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500/20 to-primary/20 font-mono text-sm font-bold text-primary border border-primary/30">
                      {author.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-foreground">{author}</span>
                        <span className="text-[11px] text-muted-foreground">· {timeAgo}</span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Seeking Compute
                      </p>
                    </div>
                  </div>

                  {/* Budget Badge */}
                  <div className="text-right">
                    <div className="font-mono text-base font-extrabold text-primary">
                      {formatINR(r.budget_inr)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      ≈ {formatINR(rate)}/hr
                    </div>
                  </div>
                </div>

                {/* Content: Title & Details */}
                <div className="mt-3.5">
                  <Link
                    to="/requests/$id"
                    params={{ id: r.id }}
                    className="block text-base font-bold text-foreground transition-colors group-hover:text-primary leading-snug"
                  >
                    {r.title}
                  </Link>
                  {r.details && (
                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {r.details}
                    </p>
                  )}
                </div>

                {/* Specs pill badges */}
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground border border-border">
                    <Cpu className="h-3 w-3 text-primary" />
                    {r.min_vram_gb} GB VRAM
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground border border-border">
                    <Clock className="h-3 w-3 text-primary" />
                    {hrs} hrs duration
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground border border-border">
                    <Layers className="h-3 w-3 text-primary" />
                    {r.preferred_gpu || (r.gpu_flexible ? "Any GPU model" : "Specific GPU")}
                  </span>
                </div>

                {/* Social Interaction Bar (Like, Offer/Chat, Bookmark, Share) */}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleLike(r.id)}
                      className={`flex items-center gap-1 transition-colors hover:text-rose-500 ${
                        isLiked ? "text-rose-500 font-medium" : ""
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-rose-500" : ""}`} />
                      <span>{isLiked ? 1 : 0}</span>
                    </button>

                    <Link
                      to="/requests/$id"
                      params={{ id: r.id }}
                      className="flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Respond</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleShare(r.id, r.title)}
                      className="flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                      <Share2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleBookmark(r.id)}
                      className="p-1 hover:text-foreground transition-colors"
                      title="Bookmark request"
                    >
                      <Bookmark
                        className={`h-4 w-4 ${isBookmarked ? "fill-primary text-primary" : ""}`}
                      />
                    </button>

                    <Button asChild size="sm" variant="default" className="h-8 gap-1 text-xs">
                      <Link to="/requests/$id" params={{ id: r.id }}>
                        Make Offer
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
