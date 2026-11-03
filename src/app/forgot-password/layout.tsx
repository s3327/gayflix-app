import type { Metadata } from "next";


// The page is a client component, which can't name itself in the tab.
export const metadata: Metadata = {
  title: "Forgot Password",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
