import { redirect } from "next/navigation";

// domain.com has no landing page of its own yet, so it opens the site
// itself. A marketing page can take this route over later; the header
// logo already links straight to /home.
export default function RootPage() {
  redirect("/home");
}
