import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import type { BasicTitle } from "@/lib/find-basic-title";
import FavoriteButton from "@/components/FavoriteButton";

export default function BasicTitleFallback({
  item,
  typeLabel,
}: {
  item: BasicTitle;
  typeLabel: string;
}) {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <div className="mx-auto w-full max-w-[240px] shrink-0 md:mx-0 md:w-72">
          <div className="relative aspect-2/3 w-full overflow-hidden rounded-card bg-bg-surface">
            <Image
              src={item.posterUrl}
              alt={item.title}
              fill
              sizes="288px"
              className="object-cover"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Link
              href={`/watch/${item.id}`}
              className="flex items-center justify-center gap-2 rounded-card bg-brand-pink px-5 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
            >
              <Play className="h-4 w-4 fill-current" />
              Watch Now
            </Link>

            <FavoriteButton
              showLabel
              media={{
                id: item.id,
                title: item.title,
                year: item.year,
                duration: item.duration,
                type: typeLabel.toLowerCase() === "series" ? "series" : "movie",
                genre: item.genre,
                posterUrl: item.posterUrl,
              }}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {typeLabel}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
            {item.title}
          </h1>
          <p className="mt-1 text-ink-secondary">
            {item.year} · {item.genre} · {item.duration}
          </p>
          <p className="mt-6 max-w-lg text-sm text-ink-muted">
            Full details for this title haven&apos;t been imported yet —
            synopsis, cast, and other metadata will appear here once
            available.
          </p>
        </div>
      </div>
    </main>
  );
}
