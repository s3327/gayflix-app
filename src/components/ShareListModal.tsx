"use client";

import { useId, useState, useTransition } from "react";
import { Link2, Lock } from "lucide-react";
import Modal from "@/components/Modal";
import NicknameField from "@/components/NicknameField";
import { copyListLink, useLists, type MediaList } from "@/lib/lists-context";
import { useToast } from "@/lib/toast-context";

function Switch({
  on,
  labelId,
  hintId,
  disabled,
  onClick,
}: {
  on: boolean;
  labelId: string;
  hintId: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      disabled={disabled}
      onClick={onClick}
      className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-brand-pink" : "bg-border-strong"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-ink-primary transition-transform ${
          on ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

/**
 * Community Lists, for a shared list: shows it on /lists under the
 * owner's nickname. A member without one picks it here first.
 */
function CommunitySwitch({ list }: { list: MediaList }) {
  const { setListInCommunity } = useLists();
  const { showToast } = useToast();
  const id = useId();
  const [needsNickname, setNeedsNickname] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const change = (on: boolean, nickname?: string) =>
    startTransition(async () => {
      setError(null);
      const problem = await setListInCommunity(list.id, on, nickname);
      if (problem?.needsNickname) {
        setNeedsNickname(true);
        return;
      }
      if (problem) {
        setError(problem.error);
        return;
      }
      setNeedsNickname(false);
      showToast(on ? "Now on Community Lists" : "Taken off Community Lists");
    });

  return (
    <div className="mt-5 border-t border-border-subtle pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={`${id}-label`} className="text-sm font-semibold text-ink-primary">
            Show in Community Lists
          </p>
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-secondary">
            {list.communityBlocked
              ? "A moderator took this list off Community Lists."
              : "Anyone browsing Community Lists finds it, with your nickname."}
          </p>
        </div>
        <Switch
          on={list.inCommunity}
          labelId={`${id}-label`}
          hintId={`${id}-hint`}
          disabled={isPending || list.communityBlocked}
          onClick={() => change(!list.inCommunity)}
        />
      </div>
      {needsNickname && (
        <form
          action={(form) => change(true, String(form.get("nickname") ?? ""))}
          className="mt-4 space-y-3"
        >
          <NicknameField />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light disabled:opacity-50"
          >
            Save and Show
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The owner's Share dialog for one list (from My Lists and the list's
 * own page). Lists start private; the switch shares it with anyone who
 * has the link, and turning it off makes the link stop working (and takes
 * it off Community Lists). A shared list can also go on Community Lists.
 */
export default function ShareListModal({
  list: saved,
  onClose,
}: {
  list: MediaList;
  onClose: () => void;
}) {
  const { getList, setListPublic } = useLists();
  const { showToast } = useToast();
  // The live copy, so the switch follows a change at once.
  const list = getList(saved.id) ?? saved;
  const id = useId();

  return (
    <Modal title={`Share "${list.name}"`} onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={`${id}-label`} className="text-sm font-semibold text-ink-primary">
            Anyone with the link can view
          </p>
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-secondary">
            {list.isPublic
              ? "They see the list's name and titles, never your name or email."
              : "Only you can see this list now."}
          </p>
        </div>
        <Switch
          on={list.isPublic}
          labelId={`${id}-label`}
          hintId={`${id}-hint`}
          onClick={() => setListPublic(list.id, !list.isPublic)}
        />
      </div>

      {list.isPublic && <CommunitySwitch list={list} />}

      <div className="mt-6 border-t border-border-subtle pt-4">
        {list.isPublic ? (
          <button
            type="button"
            onClick={() => copyListLink(list.id, showToast)}
            className="flex items-center gap-2 rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
          >
            <Link2 className="h-4 w-4" aria-hidden />
            Copy Link
          </button>
        ) : (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            Turn on sharing to get a link.
          </p>
        )}
      </div>
    </Modal>
  );
}
