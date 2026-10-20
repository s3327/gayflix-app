import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import { BUTTON_DANGER } from "@/components/admin/FormFields";
import SubtitleUploadForm from "@/components/admin/SubtitleUploadForm";
import { deleteSubtitle, uploadSubtitle } from "@/lib/admin-subtitle-actions";
import { languageName, MAX_SUBTITLES, SUBTITLE_LANGUAGES } from "@/lib/subtitles";

type Subtitle = { id: string; language: string; fileName: string; createdAt: Date };

const uploadedOn = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * The Subtitles section of a movie's or an episode's edit page: one file
 * per language, offered in the captions menu of Gayflix's own player
 * (video files and HLS streams; an embed has its own player). Admins
 * only: the page checks, and so does each server function.
 */
export default function Subtitles({
  owner,
  ownerId,
  subtitles,
}: {
  owner: "movie" | "episode";
  ownerId: string;
  subtitles: Subtitle[];
}) {
  const what = owner === "movie" ? "this movie" : "this episode";
  const sorted = subtitles
    .map((subtitle) => ({ ...subtitle, name: languageName(subtitle.language) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const has = new Set(subtitles.map((subtitle) => subtitle.language));
  const languages = SUBTITLE_LANGUAGES.map((code) => ({
    code,
    name: languageName(code),
    replaces: has.has(code),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const full = subtitles.length >= MAX_SUBTITLES;

  return (
    <section aria-labelledby={`subtitles-heading-${ownerId}`} className="mt-12 max-w-3xl">
      <h2 id={`subtitles-heading-${ownerId}`} className="font-display text-xl font-bold">
        Subtitles
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Members choose these in the player&apos;s captions menu, when {what} plays from a video
        file or an HLS stream. Embedded players show their own.
      </p>

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-ink-secondary">No subtitles yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
          {sorted.map((subtitle) => (
            <li
              key={subtitle.id}
              aria-label={subtitle.name}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink-primary">{subtitle.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {subtitle.fileName} · uploaded {uploadedOn.format(subtitle.createdAt)}
                </p>
              </div>
              <form action={deleteSubtitle.bind(null, subtitle.id)}>
                <ConfirmSubmitButton
                  confirmTitle={`Delete the ${subtitle.name} subtitles?`}
                  confirmDescription="Members won't be able to choose them any more. You can upload the file again later."
                  confirmLabel="Delete subtitles"
                  ariaLabel={`Delete ${subtitle.name} subtitles`}
                  className={BUTTON_DANGER}
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 rounded-card border border-border-subtle bg-bg-surface p-5">
        <h3 className="font-display text-lg font-bold">Upload subtitles</h3>
        {full ? (
          <p className="mt-2 text-sm text-ink-secondary">
            There can be {MAX_SUBTITLES} languages at most. Delete one to add another, or upload a
            new file for a language listed above.
          </p>
        ) : null}
        <div className="mt-4">
          <SubtitleUploadForm
            action={uploadSubtitle.bind(null, owner, ownerId)}
            languages={full ? languages.filter((language) => language.replaces) : languages}
            idPrefix={`subtitle-${ownerId}`}
          />
        </div>
      </div>
    </section>
  );
}
