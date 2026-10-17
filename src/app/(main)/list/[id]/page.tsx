import { notFound } from "next/navigation";
import { findList } from "@/lib/library";
import { getSession } from "@/lib/session";
import ListView from "./ListView";

/** A list, for its owner, and for anyone with the link once it's shared. */
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const [found, session] = await Promise.all([findList((await params).id), getSession()]);
  const isOwner = Boolean(found && session?.user.id === found.ownerId);
  // A private list looks the same as one that doesn't exist.
  if (!found || (!found.list.isPublic && !isOwner)) notFound();

  return <ListView list={found.list} isOwner={isOwner} />;
}
