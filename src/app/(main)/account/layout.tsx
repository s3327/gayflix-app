import { headers } from "next/headers";
import AccountSidebar from "@/components/AccountSidebar";
import RequireLogin from "@/components/RequireLogin";
import { requireUser } from "@/lib/session";

/**
 * Shared layout for /account and its sub-pages (favorite, history,
 * setting). Header/NavMenu/Footer still come from the (main) group
 * layout above this — this only adds the sidebar + content structure
 * inside the normal page padding, so the sidebar reads as an inset box
 * next to content, not a bar spanning full width directly under Header.
 *
 * Guests are sent to /login on the server, before anything renders, and
 * come back to the same page afterwards. `x-pathname` is set by
 * src/proxy.ts, since layouts don't receive the URL. RequireLogin
 * handles the session ending while the page is open.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser((await headers()).get("x-pathname") ?? "/account");

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <RequireLogin>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          <AccountSidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </RequireLogin>
    </main>
  );
}
