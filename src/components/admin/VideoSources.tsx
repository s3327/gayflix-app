import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import Badge from "@/components/Badge";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/components/admin/FormFields";
import VideoSourceForm from "@/components/admin/VideoSourceForm";
import {
  addVideoSource,
  deleteVideoSource,
  moveVideoSource,
  setVideoSourceEnabled,
  updateVideoSource,
} from "@/lib/admin-video-actions";
import { videoHosts, videoUrlAllowed } from "@/lib/video-hosts";
import { KIND_NAMES, MAX_VIDEO_SOURCES, type VideoSourceKind } from "@/lib/video-source";

type Source = { id: string; label: string; kind: VideoSourceKind; url: string; enabled: boolean };

const ICON_BUTTON =
  "rounded-card border border-border-strong p-2 text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary disabled:pointer-events-none disabled:opacity-40";

/**
 * The Video section of a movie's or an episode's edit page: where it
 * plays from. Each source is one of the player's server tabs, in this
 * order. Admins only: the page checks, and so does each server function.
 */
export default function VideoSources({
  owner,
  ownerId,
  sources,
}: {
  owner: "movie" | "episode";
  ownerId: string;
  sources: Source[];
}) {
  const hosts = videoHosts();
  const what = owner === "movie" ? "this movie" : "this episode";

  return (
    <section aria-labelledby="video-heading" className="mt-12 max-w-3xl">
      <h2 id="video-heading" className="font-display text-xl font-bold">
        Video
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Where {what} plays from. Each source is a server tab on the player, in this order; members
        only see the ones that are on.
      </p>

      {sources.length === 0 ? (
        <p className="mt-4 text-sm text-ink-secondary">No video yet, so {what} has nothing to play.</p>
      ) : (
        <ol className="mt-4 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
          {sources.map((source, index) => (
            <SourceRow
              key={source.id}
              source={source}
              isFirst={index === 0}
              isLast={index === sources.length - 1}
              allowed={videoUrlAllowed(source.url, hosts)}
              hosts={hosts}
            />
          ))}
        </ol>
      )}

      <div className="mt-8 rounded-card border border-border-subtle bg-bg-surface p-5">
        <h3 className="font-display text-lg font-bold">Add a source</h3>
        {sources.length >= MAX_VIDEO_SOURCES ? (
          <p className="mt-2 text-sm text-ink-secondary">
            There can be {MAX_VIDEO_SOURCES} sources at most. Delete one to add another.
          </p>
        ) : (
          <div className="mt-4">
            <VideoSourceForm
              action={addVideoSource.bind(null, owner, ownerId)}
              initialValues={{ label: `Server ${sources.length + 1}`, kind: "auto", url: "" }}
              hosts={hosts}
              idPrefix="new-source"
              submitLabel="Add source"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function SourceRow({
  source,
  isFirst,
  isLast,
  allowed,
  hosts,
}: {
  source: Source;
  isFirst: boolean;
  isLast: boolean;
  allowed: boolean;
  hosts: string[];
}) {
  return (
    <li className="px-4 py-4" aria-label={source.label}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink-primary">{source.label}</span>
            <Badge>{KIND_NAMES[source.kind]}</Badge>
            {!source.enabled && <Badge tone="danger">Off</Badge>}
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted underline-offset-2 hover:text-ink-primary hover:underline"
          >
            <span className="truncate">{source.url}</span>
            <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          {!allowed && (
            <p className="mt-1 text-xs font-medium text-status-warning">
              Its host isn&apos;t in VIDEO_HOSTS any more, so the player leaves it out.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={moveVideoSource.bind(null, source.id, "up")}>
            <button
              type="submit"
              disabled={isFirst}
              aria-label={`Move ${source.label} up`}
              className={ICON_BUTTON}
            >
              <ArrowUp aria-hidden className="h-4 w-4" />
            </button>
          </form>
          <form action={moveVideoSource.bind(null, source.id, "down")}>
            <button
              type="submit"
              disabled={isLast}
              aria-label={`Move ${source.label} down`}
              className={ICON_BUTTON}
            >
              <ArrowDown aria-hidden className="h-4 w-4" />
            </button>
          </form>
          <form action={setVideoSourceEnabled.bind(null, source.id, !source.enabled)}>
            <button type="submit" className={BUTTON_SECONDARY}>
              {source.enabled ? "Turn off" : "Turn on"}
            </button>
          </form>
          <form action={deleteVideoSource.bind(null, source.id)}>
            <ConfirmSubmitButton
              confirmTitle="Delete this source?"
              confirmDescription={`"${source.label}" will be deleted for good. To keep it for later, turn it off instead.`}
              confirmLabel="Delete source"
              ariaLabel={`Delete ${source.label}`}
              className={BUTTON_DANGER}
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-secondary hover:text-ink-primary">
          Edit {source.label}
        </summary>
        <div className="mt-4">
          <VideoSourceForm
            action={updateVideoSource.bind(null, source.id)}
            initialValues={{ label: source.label, kind: source.kind, url: source.url }}
            hosts={hosts}
            idPrefix={`source-${source.id}`}
            submitLabel="Save source"
          />
        </div>
      </details>
    </li>
  );
}
