import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/page-metadata";

// The page is a client component, which can't name itself in the tab.
export const metadata: Metadata = { title: `Sign Up · ${SITE_NAME}` };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
