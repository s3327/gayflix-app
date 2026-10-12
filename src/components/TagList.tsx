import Link from "next/link";
import { searchHref } from "@/lib/browse-href";

// Rotated across tags so a multi-tag title doesn't read as one flat block.
const TAG_COLORS = [
  "bg-pride-red-light",
  "bg-pride-yellow",
  "bg-pride-green-light",
  "bg-pride-blue-light",
  "bg-pride-purple-light",
];

/**
 * A title's tags, on its detail, watch and episode pages. Each one
 * searches for the titles tagged with it (search matches tags).
 */
export default function TagList({ tags, className = "" }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tags.map((tag, i) => (
        <Link
          key={tag}
          href={searchHref(tag)}
          className={`rounded-pill px-3 py-1 text-xs font-semibold text-bg-base transition hover:brightness-110 ${TAG_COLORS[i % TAG_COLORS.length]}`}
        >
          {tag}
        </Link>
      ))}
    </div>
  );
}
