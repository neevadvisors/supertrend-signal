"use client"

import { Send } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type PostArtworkInput,
  companyInitials,
  formatChangePct,
  formatPostPrice,
  marketLabel,
} from "@/components/posts/post-types"

export interface PostCardProps {
  artwork: PostArtworkInput
  className?: string
}

function CompanyLogo({
  name,
  symbol,
  logoDomain,
}: {
  name: string
  symbol: string
  logoDomain?: string
}) {
  const initials = companyInitials(name, symbol)

  if (!logoDomain) {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-[color:var(--post-night-rule)] bg-[color:var(--post-night-2)] text-sm font-medium text-[color:var(--post-night-ink)]">
        {initials}
      </div>
    )
  }

  return (
    <div className="relative size-14 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(logoDomain)}&sz=128`}
        alt=""
        className="size-14 rounded-full border border-[color:var(--post-night-rule)] bg-[color:var(--post-night-2)] object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none"
          const fallback = e.currentTarget.nextElementSibling
          if (fallback instanceof HTMLElement) {
            fallback.style.display = "flex"
          }
        }}
      />
      <div
        className="absolute inset-0 hidden items-center justify-center rounded-full border border-[color:var(--post-night-rule)] bg-[color:var(--post-night-2)] text-sm font-medium text-[color:var(--post-night-ink)]"
        aria-hidden
      >
        {initials}
      </div>
    </div>
  )
}

export function PostCard({ artwork, className }: PostCardProps) {
  const {
    callNo,
    side,
    symbol,
    name,
    exchange,
    sector,
    price,
    changePct,
    market,
    logoDomain,
  } = artwork

  const exchangeLabel = exchange ?? (market === "US" ? "NASDAQ" : "NSE")
  const sideColor =
    side === "BUY"
      ? "text-[color:var(--post-call-buy)]"
      : "text-[color:var(--post-call-sell)]"
  const changeColor =
    changePct != null && changePct < 0
      ? "text-[color:var(--post-call-sell)]"
      : changePct != null && changePct > 0
        ? "text-[color:var(--post-call-buy)]"
        : "text-[color:var(--post-night-muted)]"

  return (
    <div
      className={cn(
        "flex aspect-[4/5] w-full flex-col bg-[color:var(--post-night)] p-6 text-[color:var(--post-night-ink)]",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full bg-[color:var(--post-call-buy)]"
            aria-hidden
          />
          <span className="font-[family-name:var(--font-post-serif)] text-lg tracking-tight">
            Neev
          </span>
        </div>
        <span className="font-[family-name:var(--font-post-serif)] text-sm italic text-[color:var(--post-night-muted)]">
          No. {callNo}
        </span>
      </header>

      <PostRule className="mt-4" />

      <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--post-night-muted)]">
        Research call <span className="text-[color:var(--post-night-rule)]">|</span>{" "}
        {marketLabel(market)}
      </p>

      <div className="flex flex-1 flex-col justify-center py-2">
        <p
          className="font-[family-name:var(--font-post-serif)] text-[clamp(4.5rem,18vw,7rem)] leading-none italic text-[color:var(--post-night-2)]"
          aria-hidden
        >
          {callNo}
        </p>
      </div>

      <div className="flex gap-4">
        <CompanyLogo name={name} symbol={symbol} logoDomain={logoDomain} />
        <div className="min-w-0 flex-1">
          {sector ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[color:var(--post-night-muted)]">
              {sector}
            </p>
          ) : null}
          <p className="font-[family-name:var(--font-post-serif)] text-[1.75rem] leading-tight tracking-tight">
            {name}
          </p>
          <p className="mt-1 font-mono text-sm text-[color:var(--post-night-muted)]">
            {exchangeLabel}:{symbol}
          </p>
        </div>
      </div>

      <PostRule className="my-5" />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[color:var(--post-night-muted)]">
            Our view
          </p>
          <p
            className={cn(
              "font-[family-name:var(--font-post-serif)] text-4xl italic leading-none",
              sideColor
            )}
          >
            {side === "BUY" ? "Buy." : "Sell."}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[color:var(--post-night-muted)]">
            Last traded
          </p>
          <p className="font-[family-name:var(--font-post-serif)] text-2xl tracking-tight">
            {formatPostPrice(price, market)}
          </p>
          <p className={cn("text-sm", changeColor)}>{formatChangePct(changePct)}</p>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 rounded-md border border-[color:var(--post-night-rule)] bg-[color:var(--post-night-2)]/60 px-3 py-2.5">
        <Send className="mt-0.5 size-4 shrink-0 text-[color:var(--post-night-muted)]" />
        <p className="text-xs leading-snug text-[color:var(--post-night-muted)]">
          Know someone who invests for the long run? Send them this call.
        </p>
      </div>

      <footer className="mt-4 flex items-end justify-between gap-3 border-t border-[color:var(--post-night-rule)] pt-4 text-[10px] text-[color:var(--post-night-muted)]">
        <div>
          <p className="text-[color:var(--post-night-ink)]">Arjun Mehta</p>
          <p>SEBI RA · INH000017842</p>
        </div>
        <p className="text-right">Powered by neev.money</p>
      </footer>
    </div>
  )
}

function PostRule({ className }: { className?: string }) {
  return (
    <hr
      className={cn("border-0 border-t border-[color:var(--post-night-rule)]", className)}
    />
  )
}
