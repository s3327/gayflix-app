"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Info, Pause, Play } from "lucide-react";
import type { Featured } from "@/lib/catalog";
import { titleHref } from "@/lib/title-href";

/** How long each title stays before the next, in ms. */
const SLIDE_MS = 8000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The home page hero: its titles one at a time (getHome's heroes, the
 * featured one first), turning every 8 seconds. It stops turning while
 * the pointer or keyboard focus is on it, when Pause is pressed, and for
 * viewers who ask for reduced motion; the dots choose a title at any
 * time. It's about two-thirds of the screen high, so the first row peeks
 * in below it.
 *
 * The first title's name is the page's h1 (the others' are h2s). Only
 * the shown title can be read or focused: the others are inert. Screen
 * readers hear a change of title only when they made it (the dots), not
 * every 8 seconds.
 */
export default function HeroCarousel({ heroes }: { heroes: Featured[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  // The server and a reduced-motion viewer both get a still hero.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true
  );
  const canTurn = heroes.length > 1 && !reducedMotion;
  const turning = canTurn && !paused && !held;

  useEffect(() => {
    if (!turning) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % heroes.length), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [turning, index, heroes.length]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured titles"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
      }}
      className="relative h-[56vh] max-h-[760px] min-h-[400px] w-full overflow-hidden sm:h-[62vh] lg:h-[66vh]"
    >
      <div aria-live={turning ? "off" : "polite"} className="h-full">
        {heroes.map((hero, i) => {
          const shown = i === index;
          const Heading = i === 0 ? "h1" : "h2";
          return (
            <div
              key={hero.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${heroes.length}`}
              aria-hidden={!shown}
              inert={!shown}
              className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
                shown ? "opacity-100" : "opacity-0"
              }`}
            >
              {hero.backdropUrl && (
                <Image
                  src={hero.backdropUrl}
                  alt=""
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              )}
              <div
                className={`absolute inset-0 bg-linear-to-br opacity-40 mix-blend-multiply ${hero.gradient ?? ""}`}
              />
              <div className="absolute inset-0 bg-linear-to-t from-bg-base via-bg-base/40 to-transparent" />
              <div className="absolute inset-0 bg-linear-to-r from-bg-base/80 via-transparent to-transparent" />

              <div className="relative flex h-full max-w-[1440px] flex-col justify-end px-4 pb-14 sm:px-8 sm:pb-16 lg:mx-auto">
                <p className="font-body text-sm font-semibold uppercase tracking-widest text-ink-secondary">
                  {i === 0 ? "Featured Today" : "Also on Gayflix"}
                </p>
                <Heading className="mt-2 max-w-xl font-display text-4xl font-bold leading-tight sm:text-6xl sm:leading-none">
                  {hero.title}
                </Heading>
                <p className="mt-2 text-sm text-ink-secondary">
                  {[hero.year, hero.genre, hero.duration].filter(Boolean).join(" · ")}
                </p>
                {/* Cut short so a long synopsis can't push the title up under
                    the header or cover the backdrop; More Info has all of it. */}
                {hero.synopsis && (
                  <p className="mt-4 line-clamp-2 max-w-lg text-ink-secondary sm:line-clamp-3">
                    {hero.synopsis}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {/* /watch/[id] sends a series on to its first episode. */}
                  <Link
                    href={`/watch/${hero.id}`}
                    className="flex items-center gap-2 rounded-card bg-brand-pink px-7 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden />
                    Play
                  </Link>
                  <Link
                    href={titleHref(hero)}
                    className="flex items-center gap-2 rounded-card border border-border-strong bg-bg-base/40 px-7 py-3 font-body text-sm font-bold text-ink-primary backdrop-blur-sm transition-colors hover:bg-bg-elevated"
                  >
                    <Info className="h-4 w-4" aria-hidden />
                    More Info
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {heroes.length > 1 && (
        <div className="absolute bottom-4 right-4 flex items-center gap-1 sm:right-8">
          {heroes.map((hero, i) => (
            <button
              key={hero.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${hero.title}`}
              aria-current={i === index ? "true" : undefined}
              className="flex h-8 w-8 items-center justify-center rounded-full"
            >
              <span
                className={`block h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-brand-pink" : "w-2 bg-ink-secondary/60 hover:bg-ink-primary"
                }`}
              />
            </button>
          ))}
          {canTurn && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play slideshow" : "Pause slideshow"}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-bg-base/60 text-ink-secondary backdrop-blur-sm transition-colors hover:text-ink-primary"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
              ) : (
                <Pause className="h-3.5 w-3.5 fill-current" aria-hidden />
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
