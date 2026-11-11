"use client"

import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PostCard } from "@/components/posts/post-card"
import { postCaption, type PostArtworkInput } from "@/components/posts/post-types"

export interface InstagramPostProps {
  artwork: PostArtworkInput
  likes?: number
  comments?: number
  when?: string
  className?: string
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(n)
}

export function InstagramPost({
  artwork,
  likes,
  comments,
  when = "Just now",
  className,
}: InstagramPostProps) {
  const caption = postCaption(artwork)
  const username = "neev.research"

  return (
    <article
      className={cn(
        "w-full max-w-[470px] overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4be39c] to-[#12271d] text-sm font-semibold text-white"
            aria-hidden
          >
            N
          </div>
          <span className="truncate text-sm font-semibold">{username}</span>
        </div>
        <button
          type="button"
          className="text-neutral-900"
          aria-label="More options"
        >
          <MoreHorizontal className="size-6" />
        </button>
      </header>

      <PostCard artwork={artwork} className="rounded-none" />

      <div className="space-y-2 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button type="button" aria-label="Like">
              <Heart className="size-6" />
            </button>
            <button type="button" aria-label="Comment">
              <MessageCircle className="size-6" />
            </button>
            <button type="button" aria-label="Share">
              <Send className="size-6" />
            </button>
          </div>
          <button type="button" aria-label="Save">
            <Bookmark className="size-6" />
          </button>
        </div>

        {likes != null ? (
          <p className="text-sm font-semibold">{formatCount(likes)} likes</p>
        ) : null}

        <p className="text-sm leading-snug">
          <span className="font-semibold">{username}</span>{" "}
          <span className="text-neutral-800">{caption}</span>
        </p>

        {comments != null && comments > 0 ? (
          <button
            type="button"
            className="text-sm text-neutral-500"
          >
            View all {formatCount(comments)} comments
          </button>
        ) : null}

        <time className="block text-[10px] uppercase tracking-wide text-neutral-400">
          {when}
        </time>
      </div>
    </article>
  )
}
