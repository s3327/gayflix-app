import type { Metadata } from "next";
import UnsubscribeForm from "./UnsubscribeForm";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/**
 * Where the new-episode emails' "stop them" link leads. It asks first:
 * opening the link changes nothing, so a mail scanner can't unsubscribe
 * anyone. No sign-in needed; the link is signed (src/lib/unsubscribe.ts).
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-4 py-16 sm:py-24">
      <h1 className="font-display text-3xl font-bold">New episode emails</h1>
      <UnsubscribeForm userId={firstParam(params.u) ?? ""} token={firstParam(params.t) ?? ""} />
    </main>
  );
}
