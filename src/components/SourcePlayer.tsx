"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type Hls from "hls.js";
import type { VideoSourceEntry } from "@/lib/video-source";

/** How browsers that play HLS themselves (Safari) name its playlists. */
const HLS_TYPE = "application/vnd.apple.mpegurl";

/**
 * Plays one video source, filling WatchPlayer's frame:
 *
 * - embed: the provider's own player page, in a frame. What happens in
 *   it is the provider's business; a frame can't say whether it failed.
 * - file: an MP4 or WebM file, in the browser's video player.
 * - hls: a stream (.m3u8), played by hls.js where the browser has Media
 *   Source Extensions, or by the browser itself (Safari on iPhone).
 *   hls.js is only downloaded for these.
 *
 * Every source's host is on VIDEO_HOSTS, which the Content-Security-Policy
 * lets the page frame, play and stream from (src/lib/csp.ts).
 * `onFail` is called when a file or a stream can't play.
 */
export default function SourcePlayer({
  source,
  title,
  onFail,
}: {
  source: VideoSourceEntry;
  title: string;
  onFail: () => void;
}) {
  if (source.kind === "embed") {
    return (
      <iframe
        src={source.url}
        title={`${title} (${source.label})`}
        allow="autoplay; picture-in-picture; encrypted-media"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0 bg-black focus-visible:-outline-offset-4"
      />
    );
  }
  return <VideoPlayer source={source} title={title} onFail={onFail} />;
}

function VideoPlayer({
  source,
  title,
  onFail,
}: {
  source: VideoSourceEntry;
  title: string;
  onFail: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // While hls.js plays the stream, it reports the video's errors itself.
  const hlsRef = useRef<Hls | null>(null);
  const fail = useEffectEvent(onFail);

  useEffect(() => {
    const video = videoRef.current;
    if (source.kind !== "hls" || !video) return;
    let cancelled = false;
    import("hls.js").then(
      ({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType(HLS_TYPE)) video.src = source.url;
          else fail();
          return;
        }
        const hls = new Hls();
        hlsRef.current = hls;
        let recovered = false;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          // hls.js retries failed downloads itself before calling an error
          // fatal. A decoding error can often be got past once.
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            hls.recoverMediaError();
            return;
          }
          fail();
        });
        hls.loadSource(source.url);
        hls.attachMedia(video);
      },
      // The script didn't download (offline, or a new version deployed).
      () => {
        if (!cancelled) fail();
      }
    );
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [source.kind, source.url]);

  return (
    <video
      ref={videoRef}
      src={source.kind === "file" ? source.url : undefined}
      aria-label={title}
      controls
      autoPlay
      playsInline
      onError={() => {
        if (!hlsRef.current) onFail();
      }}
      className="absolute inset-0 h-full w-full bg-black focus-visible:-outline-offset-4"
    />
  );
}
