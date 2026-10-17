import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { findList } from "@/lib/library";
import { getSession } from "@/lib/session";
import ListView from "./ListView";

/**
 * The list if this visitor may see it, else null: its owner always, and
 * anyone with the link once it's shared. Read once for both the tab
 * title and the page.
 */
const loadList = cache(async (id: string) => {
  const [found, session] = await Promise.all([findList(id), getSession()]);
  const isOwner = Boolean(found && session?.user.id === found.ownerId);
  if (!found || (!found.list.isPublic && !isOwner)) return null;
  return { list: found.list, isOwner };
});

function titleCount(count: number) {
  return `${count} ${count === 1 ? "title" : "titles"}`;
}

/**
 * Names the list in the tab and in link previews. Only a shared list's
 * preview says what's in it, and no list shows in search results: shared
 * means shared by link.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const loaded = await loadList((await params).id);
  if (!loaded) return { title: "List", robots: { index: false } };
  const { list } = loaded;
  const description = `A list of ${titleCount(list.items.length)} on Gayflix.`;
  return {
    title: list.name,
    description,
    robots: { index: false },
    openGraph: list.isPublic
      ? {
          title: list.name,
          description,
          images: list.items.find((item) => item.posterUrl)?.posterUrl,
        }
      : undefined,
  };
}

/** A list, for its owner, and for anyone with the link once it's shared. */
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadList((await params).id);
  // A private list looks the same as one that doesn't exist.
  if (!loaded) notFound();

  return <ListView list={loaded.list} isOwner={loaded.isOwner} />;
}
