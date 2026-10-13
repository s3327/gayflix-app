import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Two-Factor Setup",
};

export default function Setup2faLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

