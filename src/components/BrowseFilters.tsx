"use client";

import { useRouter } from "next/navigation";
import {
  BROWSE_SORTS,
  browseHref,
  decadesOf,
  type BrowseOptions,
  type BrowseQuery,
  type BrowseSort,
} from "@/lib/browse";

const LABEL = "text-xs font-semibold uppercase tracking-wide text-ink-secondary";
const SELECT =
  "w-full rounded-md border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden";

function Field({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  const id = `browse-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {/* Keyed by value so going back to another address shows its choice. */}
      <select key={value} id={id} name={name} defaultValue={value} className={SELECT}>
        {children}
      </select>
    </div>
  );
}

/**
 * Browse's filters and sort. Picking a choice goes straight to that
 * address (page 1); without JavaScript the form sends the same query
 * with its Apply button.
 */
export default function BrowseFilters({
  options,
  query,
}: {
  options: BrowseOptions;
  query: BrowseQuery;
}) {
  const router = useRouter();

  function go(form: HTMLFormElement) {
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "");
    router.push(
      browseHref({
        type: value("type") as BrowseQuery["type"],
        genre: value("genre"),
        year: value("year"),
        country: value("country"),
        language: value("language"),
        sort: value("sort") as BrowseSort,
      })
    );
  }

  return (
    <form
      action="/browse"
      aria-label="Filters"
      onChange={(event) => go(event.currentTarget)}
      onSubmit={(event) => {
        event.preventDefault();
        go(event.currentTarget);
      }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
    >
      <Field name="type" label="Type" value={query.type}>
        <option value="">Movies and series</option>
        <option value="movie">Movies</option>
        <option value="series">Series</option>
      </Field>
      <Field name="genre" label="Genre" value={query.genre}>
        <option value="">Any genre</option>
        {options.genres.map((genre) => (
          <option key={genre}>{genre}</option>
        ))}
      </Field>
      <Field name="year" label="Year" value={query.year}>
        <option value="">Any year</option>
        <optgroup label="Decades">
          {decadesOf(options.years).map((decade) => (
            <option key={decade}>{`${decade}s`}</option>
          ))}
        </optgroup>
        <optgroup label="Years">
          {options.years.map((year) => (
            <option key={year}>{String(year)}</option>
          ))}
        </optgroup>
      </Field>
      <Field name="country" label="Country" value={query.country}>
        <option value="">Any country</option>
        {options.countries.map((country) => (
          <option key={country}>{country}</option>
        ))}
      </Field>
      <Field name="language" label="Language" value={query.language}>
        <option value="">Any language</option>
        {options.languages.map((language) => (
          <option key={language}>{language}</option>
        ))}
      </Field>
      <Field name="sort" label="Sort by" value={query.sort}>
        {Object.entries(BROWSE_SORTS).map(([sort, label]) => (
          <option key={sort} value={sort}>
            {label}
          </option>
        ))}
      </Field>
      <noscript>
        <button
          type="submit"
          className="rounded-card bg-brand-pink px-6 py-2.5 text-sm font-bold text-ink-onBrand"
        >
          Apply
        </button>
      </noscript>
    </form>
  );
}
