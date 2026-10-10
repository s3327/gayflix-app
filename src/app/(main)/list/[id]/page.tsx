import { notFound } from "next/navigation";
import { findList } from "@/lib/library";
import { getSession } from "@/lib/session";
import ListView from "./ListView";

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await findList((await params).id);
  if (!found) notFound();
  const session = await getSession();

  return <ListView list={found.list} isOwner={session?.user.id === found.ownerId} />;
}
