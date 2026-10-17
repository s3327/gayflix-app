import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Clapperboard, Heart, History } from "lucide-react";
import Footer from "@/components/Footer";
import MediaCard from "@/components/MediaCard";
import { genreHref } from "@/lib/browse-href";
import { listFilterValues, listTitles } from "@/lib/catalog";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getSiteSettings } from "@/lib/site-settings";
import { isStaffRole } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

/*
 * The landing page, domain.com: what Gayflix is, a look at the catalog,
 * and the way in. The site itself starts at /home (the (main) group), so
 * this page has its own simpler header: the logo, and Log In / Sign Up
 * (or Go to Home once signed in) instead of search and navigation.
 *
 * Layout per size: phones stack everything in one column with
 * full-width buttons; tablets put the buttons side by side and show
 * more of the poster wall and the New row; desktops show the most.
 */

const PRIMARY_BUTTON =
  "flex items-center justify-center gap-2 rounded-card bg-brand-pink px-7 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark";
const SECONDARY_BUTTON =
  "flex items-center justify-center gap-2 rounded-card border border-border-strong bg-bg-base/40 px-7 py-3 text-sm font-bold text-ink-primary backdrop-blur-sm transition-colors hover:bg-bg-elevated";

/**
 * Enough posters to cover the hero at every size: 4 rows of 4 columns on
 * phones, 6 on tablets and 8 on desktops. Smaller screens leave out the
 * tiles they have no room for, so they never download them.
 */
const POSTER_WALL_SIZE = 32;
const PHONE_WALL_SIZE = 16;
const TABLET_WALL_SIZE = 24;

function wallTileVisibility(index: number) {
  if (index >= TABLET_WALL_SIZE) return "hidden lg:block";
  if (index >= PHONE_WALL_SIZE) return "hidden sm:block";
  return "";
}
/** The New row: 6 on phones (3 × 2), 8 on tablets (4 × 2), 12 on desktops (6 × 2). */
const NEW_ROW_SIZE = 12;

const FEATURES = [
  {
    icon: Heart,
    title: "Stories that are ours",
    body: "Films and series about our lives, our loves and the families we choose, hand-picked for our community.",
  },
  {
    icon: Clapperboard,
    title: "Movies and series",
    body: "From features and documentaries to series you can binge. See what's new and what everyone's watching this week.",
  },
  {
    icon: History,
    title: "Pick up where you left off",
    body: "With an account, your favorites, lists and watch history follow you to every device.",
  },
];

function Actions({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
      {signedIn ? (
        <>
          <Link href="/home" className={PRIMARY_BUTTON}>
            Go to Home
          </Link>
          <Link href="/browse" className={SECONDARY_BUTTON}>
            Browse Titles
          </Link>
        </>
      ) : (
        <>
          <Link href="/home" className={PRIMARY_BUTTON}>
            Start Browsing
          </Link>
          <Link href="/signup" className={SECONDARY_BUTTON}>
            Create an Account
          </Link>
        </>
      )}
    </div>
  );
}

export default async function LandingPage() {
  const [session, settings] = await Promise.all([getSession(), getSiteSettings()]);

  if (settings.maintenanceMode && !isStaffRole(session?.user?.role)) {
    redirect("/maintenance");
  }

  const [{ items: newest }, genres] = await Promise.all([
    listTitles({ sort: "added", page: 1 }),
    listFilterValues("genre"),
  ]);

  const signedIn = Boolean(session);
  // Repeats the newest titles when there are fewer than the wall holds.
  const posterWall =
    newest.length > 0
      ? Array.from({ length: POSTER_WALL_SIZE }, (_, i) => newest[i % newest.length])
      : [];
  const newRow = newest.slice(0, NEW_ROW_SIZE);

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-8">
          {/* Icon-only below lg, the full lockup from lg, like Header. */}
          <Link href="/" aria-label="Gayflix home" className="shrink-0 rounded-xs">
            <Image
              src="/brand/gayflix-icon.png"
              alt="Gayflix"
              width={500}
              height={500}
              priority
              className="block h-9 w-9 sm:h-10 sm:w-10 lg:hidden"
            />
            <Image
              src="/brand/gayflix-logo-tagline.png"
              alt="Gayflix — Love. Stories. Ours."
              width={600}
              height={600}
              priority
              className="hidden h-14 w-auto lg:block"
            />
          </Link>

          <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
            {signedIn ? (
              <Link href="/home" className={`${PRIMARY_BUTTON} px-4 py-2 sm:px-5`}>
                Go to Home
              </Link>
            ) : (
              <>
                <Link href="/login" className={`${SECONDARY_BUTTON} px-4 py-2 sm:px-5`}>
                  Log In
                </Link>
                <Link href="/signup" className={`${PRIMARY_BUTTON} px-4 py-2 sm:px-5`}>
                  Sign Up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero, over a tilted wall of the newest posters */}
        <section className="relative isolate flex min-h-[600px] items-center overflow-hidden pb-16 pt-28 sm:min-h-[680px] sm:pt-32 lg:min-h-[760px]">
          {posterWall.length > 0 && (
            <div aria-hidden className="absolute inset-0 -z-10">
              <div className="absolute left-1/2 top-1/2 grid w-[160%] -translate-x-1/2 -translate-y-1/2 -rotate-6 grid-cols-4 gap-3 sm:w-[130%] sm:grid-cols-6 sm:gap-4 lg:w-[115%] lg:grid-cols-8">
                {posterWall.map((title, i) => (
                  <div
                    key={i}
                    className={`relative aspect-2/3 overflow-hidden rounded-card bg-bg-surface bg-linear-to-br ${title.gradient ?? ""} ${wallTileVisibility(i)}`}
                  >
                    {/* Lazy, so a tile left out at this size isn't fetched. */}
                    <Image
                      src={title.posterUrl}
                      alt=""
                      fill
                      fetchPriority="low"
                      sizes="(min-width: 1024px) 200px, (min-width: 640px) 170px, 150px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
              {/* Dark enough everywhere for the text on top to read. */}
              <div className="absolute inset-0 bg-bg-base/80" />
              <div className="absolute inset-0 bg-linear-to-b from-bg-base/70 via-transparent to-bg-base" />
            </div>
          )}

          <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-8">
            <h1 className="font-display text-5xl font-bold leading-[1.05] sm:text-6xl lg:text-7xl">
              Love. Stories.{" "}
              <span className="bg-linear-to-r from-pride-red-light via-pride-yellow to-pride-blue-light bg-clip-text text-transparent">
                Ours.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-ink-secondary sm:text-lg">
              LGBTQ+ films and series, hand-picked for our community. Browse the whole collection,
              and sign up to keep your favorites, lists and watch history.
            </p>
            <div className="mt-8">
              <Actions signedIn={signedIn} />
            </div>
          </div>
        </section>

        {newRow.length > 0 && (
          <section
            aria-labelledby="new-heading"
            className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-8 sm:pb-20"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="new-heading" className="font-display text-2xl font-bold sm:text-3xl">
                New on Gayflix
              </h2>
              <Link
                href="/new-releases"
                className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
              >
                See All
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <ul className="mt-6 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-x-6 lg:grid-cols-6">
              {newRow.map((title, i) => (
                <li
                  key={title.id}
                  className={i >= 8 ? "hidden lg:block" : i >= 6 ? "hidden sm:block" : undefined}
                >
                  <MediaCard item={title} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-labelledby="why-heading"
          className="border-y border-border-subtle bg-bg-surface"
        >
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-20">
            <h2
              id="why-heading"
              className="text-center font-display text-2xl font-bold sm:text-3xl"
            >
              Picked by us, for us
            </h2>
            <ul className="mt-10 grid gap-4 sm:gap-6 md:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="rounded-card border border-border-subtle bg-bg-base p-6"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-pink/15 text-ink-brand">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {genres.length > 0 && (
          <section
            aria-labelledby="genres-heading"
            className="mx-auto max-w-[1200px] px-4 py-16 text-center sm:px-8 sm:py-20"
          >
            <h2 id="genres-heading" className="font-display text-2xl font-bold sm:text-3xl">
              Find your next favorite
            </h2>
            <ul className="mt-8 flex flex-wrap justify-center gap-2 sm:gap-3">
              {genres.map((genre) => (
                <li key={genre}>
                  <Link
                    href={genreHref(genre)}
                    className="block rounded-pill border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:border-brand-pink hover:text-ink-brand"
                  >
                    {genre}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="cta-heading" className="px-4 pb-20 sm:px-8">
          <div className="mx-auto max-w-[1200px] rounded-card border border-border-subtle bg-linear-to-br from-brand-pink/20 via-bg-surface to-pride-purple/30 px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 id="cta-heading" className="font-display text-2xl font-bold sm:text-4xl">
              Your next favorite story is waiting.
            </h2>
            <div className="mt-8">
              <Actions signedIn={signedIn} />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
