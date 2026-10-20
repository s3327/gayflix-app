"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";
import Modal from "@/components/Modal";
import { trailerEmbedUrl } from "@/lib/title-extras";

/**
 * Plays a title's trailer in a dialog, in YouTube's privacy-enhanced
 * player (allowed by the CSP's frame-src, src/lib/csp.ts). Nothing from
 * YouTube loads until it's opened. Renders nothing for a link that
 * isn't YouTube's.
 */
export default function TrailerButton({
  trailerUrl,
  title,
  className,
}: {
  trailerUrl: string;
  title: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const src = trailerEmbedUrl(trailerUrl);
  if (!src) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        <Clapperboard className="h-5 w-5" aria-hidden />
        <span className="text-sm font-semibold">Trailer</span>
      </button>
      {open && (
        <Modal title={`${title}: Trailer`} onClose={() => setOpen(false)} size="video">
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
            <iframe
              src={src}
              title={`${title} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </Modal>
      )}
    </>
  );
}
