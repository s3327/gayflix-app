/*
 * The facts the legal pages (/terms, /privacy, /copyright, /about,
 * /contact) fill in. Each one in [brackets] is a placeholder that still
 * has to be replaced with the real value before launch; the pages show
 * it as written, so a missing one is easy to spot. Have the finished
 * pages reviewed by a lawyer for the country named here.
 */
export const LEGAL = {
  /** Who runs the site: a person's or a company's legal name. */
  operator: "[Operator name]",
  /** Whose law the Terms follow, and where disputes are heard. */
  country: "[Country]",
  /** Where members, rights holders and privacy requests write to. */
  contactEmail: "[contact email]",
  /** When the Terms and Privacy Policy last changed. */
  lastUpdated: "October 17, 2026",
} as const;

/** A value that is still a [placeholder]. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith("[");
}
