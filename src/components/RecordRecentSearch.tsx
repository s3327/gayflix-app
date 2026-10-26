"use client";

import { useEffect } from "react";
import { addRecentSearch } from "@/lib/recent-searches";

/** Keeps the search page's query in this browser's recent searches. Renders nothing. */
export default function RecordRecentSearch({ query }: { query: string }) {
  useEffect(() => {
    addRecentSearch(query);
  }, [query]);
  return null;
}
