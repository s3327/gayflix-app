import Image from "next/image";
import Link from "next/link";

const FOOTER_LINKS: { heading: string; links: string[] }[] = [
  { heading: "Browse", links: ["Movies", "Series", "New Releases", "Trending Now"] },
  { heading: "Company", links: ["About", "Careers", "Contact"] },
  { heading: "Legal", links: ["Terms of Service", "Privacy Policy", "Cookie Policy"] },
];

// Active routes mapped for footer items
const FOOTER_HREFS: Record<string, string> = {
  "Movies": "/movie",
  "Series": "/series",
  "New Releases": "/new-releases",
  "Trending Now": "/trending",
  "Terms of Service": "/terms",
  "Privacy Policy": "/privacy",
};

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-bg-surface">
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
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
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {col.heading}
                </h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {col.links.map((link) => {
                    const href = FOOTER_HREFS[link];
                    return (
                      <li key={link}>
                        {href ? (
                          <Link
                            href={href}
                            className="text-sm text-ink-secondary transition-colors hover:text-brand-pink"
                          >
                            {link}
                          </Link>
                        ) : (
                          // No route built yet — visual only
                          <button
                            type="button"
                            className="text-sm text-ink-secondary transition-colors hover:text-brand-pink"
                          >
                            {link}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border-subtle pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Gayflix. All rights reserved.</p>
          <p>Made with pride, for the community.</p>
        </div>
      </div>
    </footer>
  );
}
