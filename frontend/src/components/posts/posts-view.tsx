"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Eye,
  Grid3x3,
  Heart,
  Loader2,
  MessageCircle,
  Trash2,
} from "lucide-react";
import { InstagramPost } from "@/components/posts/instagram-post";
import { PostsSkeleton } from "@/components/posts/posts-skeleton";
import type { PostArtworkInput } from "@/components/posts/post-types";
import { Button } from "@/components/ui/button";
import { deletePost, fetchPosts } from "@/lib/api";
import type { PostItem, PostsListResponse } from "@/lib/schemas";
import { formatLastRun } from "@/lib/signal-cache";
import { cn } from "@/lib/utils";

function fmtCount(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

function postToArtwork(post: PostItem): PostArtworkInput {
  const side = post.side === "SELL" ? "SELL" : "BUY";
  const market = post.market === "US" ? "US" : "IN";
  return {
    callNo: post.call_no,
    side,
    symbol: post.symbol,
    name: post.display_name,
    exchange: post.exchange_segment,
    price: post.price,
    changePct: post.change_pct,
    market,
  };
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--ds-muted)]">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold text-[var(--ds-text)]">
        {value}
      </div>
    </div>
  );
}

export function PostsView() {
  const [data, setData] = useState<PostsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetchPosts();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleTakeDown = async (id: string) => {
    setRemovingId(id);
    setError(null);
    try {
      await deletePost(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove post");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return <PostsSkeleton />;
  }

  const totals = data?.totals ?? { count: 0, views: 0, likes: 0, comments: 0 };
  const posts = data?.posts ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-8 pt-7 pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">
          Posts
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ds-muted)]">
          Approved calls published to Neev&apos;s Instagram feed. Take down a
          post here to remove it from the public grid.
        </p>
        <div className="mt-5 flex flex-wrap gap-10">
          <StatBlock label="Posts" value={fmtCount(totals.count)} />
          <StatBlock label="Reach" value={fmtCount(totals.views)} />
          <StatBlock label="Likes" value={fmtCount(totals.likes)} />
        </div>
      </header>

      {error ? (
        <div className="mx-8 mt-4 rounded-lg border border-[var(--ds-sell)]/40 bg-[color-mix(in_srgb,var(--ds-sell)_12%,transparent)] px-4 py-3 text-sm text-[var(--ds-text)]">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {posts.length === 0 ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--ds-border)] px-6 py-20 text-center"
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--ds-muted)]">
              <Grid3x3 size={20} strokeWidth={1.75} />
            </div>
            <div className="mt-3 text-sm font-medium text-[var(--ds-text)]">
              Nothing posted yet
            </div>
            <p className="mt-1 max-w-sm text-sm text-[var(--ds-muted)]">
              Approve signals from the review queue to publish them to Instagram.
            </p>
            <Link
              href="/"
              className="mt-4 text-sm font-medium text-[var(--ds-text)] underline-offset-2 hover:underline"
            >
              Go to Signals
            </Link>
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
          >
            {posts.map((post) => {
              const artwork = postToArtwork(post);
              const busy = removingId === post.id;
              return (
                <div key={post.id} className="flex flex-col gap-3">
                  <InstagramPost
                    artwork={artwork}
                    likes={post.likes}
                    comments={post.comments}
                    when={formatLastRun(post.published_at)}
                  />
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium text-[var(--ds-text)]">
                        {post.symbol}
                        <span className="ml-1.5 font-sans font-normal text-[var(--ds-muted)]">
                          · {post.timeframe}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--ds-muted)]">
                        <span className="inline-flex items-center gap-1">
                          <Eye size={12} strokeWidth={1.75} />
                          {fmtCount(post.views)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart size={12} strokeWidth={1.75} />
                          {fmtCount(post.likes)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle size={12} strokeWidth={1.75} />
                          {fmtCount(post.comments)}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleTakeDown(post.id)}
                      className="shrink-0"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Take down
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
