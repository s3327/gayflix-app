import AccountSidebar from "@/components/AccountSidebar";

/**
 * Shared layout for /account and its sub-pages (favorite, history,
 * setting). Header/NavMenu/Footer still come from the (main) group
 * layout above this — this only adds the sidebar + content structure
 * inside the normal page padding, so the sidebar reads as an inset box
 * next to content, not a bar spanning full width directly under Header.
 *
 * A real isLoggedIn flag exists now (see auth-context.tsx), used by
 * Header's account icon — but this page still doesn't check it or
 * redirect guests to /login. That's deliberate for now, not an
 * oversight: enforcing that is route-protection logic, a bigger step
 * than just tracking the flag, and still falls under "no architectural
 * workflow yet." Right now /account is reachable by anyone who
 * navigates to it directly, logged in or not.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <AccountSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
