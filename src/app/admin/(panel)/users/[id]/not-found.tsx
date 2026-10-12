import Link from "next/link";
import { BUTTON_SECONDARY } from "@/components/admin/FormFields";

/** An account that doesn't exist (deleted, or a mistyped link). */
export default function UserNotFound() {
  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">No such account</h1>
      <p className="mt-2 max-w-lg text-sm text-ink-muted">
        It may have been deleted, or the link may be wrong.
      </p>
      <Link href="/admin/users" className={`mt-6 inline-block ${BUTTON_SECONDARY}`}>
        Open Users
      </Link>
    </div>
  );
}
