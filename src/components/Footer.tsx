import Image from "next/image";
import Link from "next/link";

const FOOTER_LINKS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Browse",
    links: [
      { label: "Movies", href: "/movie" },
      { label: "Series", href: "/series" },
      { label: "New Releases", href: "/new-releases" },
      { label: "Trending Now", href: "/trending" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Copyright", href: "/copyright" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Cookies", href: "/privacy#cookies" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-bg-surface">
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
        {/* Brand above the link columns until lg; side by side there'd
            be too little room on tablets, and the columns would wrap. */}
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <Image
              src="/brand/gayflix-logo-tagline.png"
              alt="Gayflix — Love. Stories. Ours."
              width={600}
              height={600}
              className="h-10 w-auto"
            />
            <p className="mt-3 text-sm text-ink-muted">
              Stories, films, and series for our community — picked by us,
              for us.
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-12">
            {FOOTER_LINKS.map((col) => (
              <div key={col.heading}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {col.heading}
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-ink-secondary transition-colors hover:text-ink-brand"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border-subtle pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Gayflix. All rights reserved.</p>
          <p>Made with pride, for the community.</p>
        </div>

        {/* Credits the title sources ask for (TMDB's terms, OMDb's CC BY-NC license). */}
        <p className="mt-4 text-xs text-ink-muted">
          Title details and images come from{" "}
          <a href="https://www.themoviedb.org/" className="underline underline-offset-2 hover:text-ink-secondary">
            TMDB
          </a>{" "}
          and{" "}
          <a href="https://www.omdbapi.com/" className="underline underline-offset-2 hover:text-ink-secondary">
            OMDb
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </footer>
  );
}
