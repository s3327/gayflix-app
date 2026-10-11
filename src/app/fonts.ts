import { Baloo_2, Inter } from "next/font/google";

// Self-hosted at build time by next/font — no runtime request to Google Fonts,
// no layout shift. Exposed as CSS variables and mapped in globals.css
// as --font-display / --font-body.
const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

/** For the <html> element of the root layout and global-error.tsx. */
export const fontVariables = `${baloo.variable} ${inter.variable}`;
