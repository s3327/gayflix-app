"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type Hls from "hls.js";
import { subtitleUrl, type SubtitleTrack } from "@/lib/subtitles";
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
 * `onFail` is called when a file or a stream can't play. `onStart` is
 * called when watching begins: once a file or a stream is actually
 * playing, and at once for an embed, whose frame can't tell.
 *
 * A file or a stream also starts `startAt` seconds in, and reports how
 * far it got with `onProgress`: every 15 seconds of playing, on pause,
 * at the end, when the tab is hidden and when the player goes away.
 * `onEnded` is called when it plays to the end. Its `subtitles` are in
 * the video player's captions menu, and the language last chosen there
 * (or Off) is chosen again next time, in any title. An embed does none
 * of these.
 */
export default function SourcePlayer({
  source,
  title,
  startAt = 0,
  onStart,
  onProgress,
  onEnded,
  onFail,
  subtitles = [],
}: {
  source: VideoSourceEntry;
  title: string;
  startAt?: number;
  subtitles?: SubtitleTrack[];
  onStart: () => void;
  onProgress: (position: number, duration: number) => void;
  onEnded?: () => void;
  onFail: () => void;
}) {
  if (source.kind === "embed") {
    return <EmbedPlayer source={source} title={title} onStart={onStart} />;
  }
  return (
    <VideoPlayer
      source={source}
      title={title}
      startAt={startAt}
      onStart={onStart}
      onProgress={onProgress}
      onEnded={onEnded}
      onFail={onFail}
      subtitles={subtitles}
    />
  );
}

function EmbedPlayer({
  source,
  title,
  onStart,
}: {
  source: VideoSourceEntry;
  title: string;
  onStart: () => void;
}) {
  const start = useEffectEvent(onStart);
  useEffect(() => start(), []);
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

/** The subtitle language last chosen, or "off", kept in the browser. */
const SUBTITLE_CHOICE_KEY = "gayflix:subtitles";

function readSubtitleChoice(): string | null {
  try {
    return window.localStorage.getItem(SUBTITLE_CHOICE_KEY);
  } catch {
    return null;
  }
}

function saveSubtitleChoice(choice: string) {
  try {
    window.localStorage.setItem(SUBTITLE_CHOICE_KEY, choice);
  } catch {
    // Private mode or storage turned off: it just isn't remembered.
  }
}

/** How often a playing video reports how far it got, in seconds of video. */
const PROGRESS_EVERY_SECONDS = 15;

function VideoPlayer({
  source,
  title,
  startAt,
  onStart,
  onProgress,
  onEnded,
  onFail,
  subtitles,
}: {
  source: VideoSourceEntry;
  title: string;
  startAt: number;
  subtitles: SubtitleTrack[];
  onStart: () => void;
  onProgress: (position: number, duration: number) => void;
  onEnded?: () => void;
  onFail: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // While hls.js plays the stream, it reports the video's errors itself.
  const hlsRef = useRef<Hls | null>(null);
  const fail = useEffectEvent(onFail);
  // Where the video is, kept as it plays: hls.js empties the video when
  // the player goes away, before it could be read there.
  const latestRef = useRef<{ position: number; duration: number } | null>(null);
  const reportedAtRef = useRef(0);
  const resumedRef = useRef(false);

  function report() {
    const latest = latestRef.current;
    if (!latest) return;
    reportedAtRef.current = latest.position;
    onProgress(latest.position, latest.duration);
  }
  const reportOnLeave = useEffectEvent(report);

  // Saves where it got to when the tab is hidden (it may be closed next)
  // and when the player goes away.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") reportOnLeave();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reportOnLeave();
    };
  }, []);

  // Shows the subtitles last chosen, and remembers what's chosen in the
  // captions menu. Only the <track>s here: a stream's own text tracks
  // (hls.js adds them) aren't remembered.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || subtitles.length === 0) return;
    const ours = () => [...video.querySelectorAll("track")].map((element) => element.track);
    const choice = readSubtitleChoice();
    for (const track of ours()) {
      if (track.language === choice) track.mode = "showing";
    }
    const onChange = () => {
      const tracks = ours();
      if (tracks.length === 0) return;
      saveSubtitleChoice(tracks.find((track) => track.mode === "showing")?.language ?? "off");
    };
    video.textTracks.addEventListener("change", onChange);
    return () => video.textTracks.removeEventListener("change", onChange);
  }, [subtitles]);

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
      onLoadedMetadata={(event) => {
        // Once: hls.js can load the stream again to get past an error.
        const video = event.currentTarget;
        if (resumedRef.current) return;
        resumedRef.current = true;
        if (startAt > 0 && startAt < video.duration) video.currentTime = startAt;
      }}
      onPlaying={() => {
        // Nothing is saved before it plays, so a server that fails saves nothing.
        const video = videoRef.current;
        if (video) latestRef.current = { position: video.currentTime, duration: video.duration };
        reportedAtRef.current = video?.currentTime ?? 0;
        onStart();
      }}
      onTimeUpdate={(event) => {
        if (!latestRef.current) return;
        const video = event.currentTarget;
        latestRef.current = { position: video.currentTime, duration: video.duration };
        // Either way, so a jump back or ahead is saved too.
        if (Math.abs(video.currentTime - reportedAtRef.current) >= PROGRESS_EVERY_SECONDS) report();
      }}
      onPause={report}
      onEnded={() => {
        report();
        onEnded?.();
      }}
      onError={() => {
        if (!hlsRef.current) onFail();
      }}
      className="absolute inset-0 h-full w-full bg-black focus-visible:-outline-offset-4"
    >
      {subtitles.map((track) => (
        <track
          key={track.id}
          kind="subtitles"
          src={subtitleUrl(track.id)}
          srcLang={track.language}
          label={track.label}
        />
      ))}
    </video>
  );
}
