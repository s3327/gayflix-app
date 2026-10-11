"use client";

import ErrorPage from "./error";
import { fontVariables } from "./fonts";
import "./globals.css";

/**
 * Stands in for the root layout when the layout itself fails: the same
 * page as error.tsx (which reports the error), in a document of its own.
 */
export default function GlobalError(props: Parameters<typeof ErrorPage>[0]) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="bg-bg-base text-ink-primary font-body antialiased">
        <ErrorPage {...props} />
      </body>
    </html>
  );
}
