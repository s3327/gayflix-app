import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import Pagination from "@/components/Pagination";
import UserBadges from "@/components/admin/UserBadges";
import { listUsers } from "@/lib/admin-users";
import { normalizeQuery } from "@/lib/search";
import { firstParam, pageParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";
import { userFilterParam, type UserFilter } from "@/lib/user-admin";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

const FILTER_LABELS: Record<UserFilter, string> = {
  all: "Everyone",
  admins: "Admins",
  banned: "Banned",
  unconfirmed: "Email not confirmed",
};

function accounts(count: number) {
  return count === 1 ? "1 account" : `${count.toLocaleString("en-US")} accounts`;
}

/**
 * Every account, newest first, searchable by name or email. Each opens
 * its own page, where an admin can change its role, ban it or sign it
 * out.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = normalizeQuery(firstParam(params.q) ?? "");
  const filter = userFilterParam(firstParam(params.show));
  const { items, page, totalPages, total, admins } = await listUsers({
    page: pageParam(params.page),
    query,
    filter,
  });

  function pageHref(target: number) {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (filter !== "all") qs.set("show", filter);
    if (target !== 1) qs.set("page", String(target));
    const search = qs.toString();
    return search ? `/admin/users?${search}` : "/admin/users";
  }

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Users</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Open an account to make it an admin, ban it, or sign it out everywhere.{" "}
          {admins === 1 ? "1 admin" : `${admins} admins`} in all.
        </p>
      </div>

      {/* A plain GET form: the search lives in the URL and works without JavaScript. */}
      <form action="/admin/users" method="GET" className="flex flex-wrap items-center gap-3 px-6 py-6 sm:px-10">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name or email"
          aria-label="Search by name or email"
          className="min-w-0 flex-1 basis-56 rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden"
        />
        <div className="relative shrink-0">
          <select
            name="show"
            defaultValue={filter}
            aria-label="Show"
            className="appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
          >
            {Object.entries(FILTER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        </div>
        <button
          type="submit"
          className="flex shrink-0 items-center gap-2 rounded-card bg-brand-pink px-6 py-2.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </form>

      {items.length === 0 ? (
        <p className="mx-6 text-sm text-ink-secondary sm:mx-10">
          {query || filter !== "all" ? "No accounts match that search." : "No accounts yet."}
        </p>
      ) : (
        <>
          <p className="mx-6 mb-3 text-sm text-ink-muted sm:mx-10">{accounts(total)}</p>
          <ul
            aria-label="Accounts"
            className="mx-6 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface sm:mx-10"
          >
            {items.map((user) => (
              <li key={user.id}>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-bg-elevated"
                >
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block truncate font-medium text-ink-primary">{user.name}</span>
                    <span className="block truncate text-sm text-ink-secondary">{user.email}</span>
                  </span>
                  <UserBadges user={user} />
                  <span className="shrink-0 text-xs text-ink-muted">Joined {date.format(user.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} makeHref={pageHref} />}
    </div>
  );
}
