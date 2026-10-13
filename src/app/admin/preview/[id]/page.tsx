import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import TitleDetail from "@/components/TitleDetail";
import Header from "@/components/Header";
import NavMenu from "@/components/NavMenu";
import Footer from "@/components/Footer";
import LibraryProviders from "@/components/LibraryProviders";
import { getDraftTitleForPreview } from "@/lib/catalog";
import { loadLibrary } from "@/lib/library";
import { getSession, requireAdmin } from "@/lib/session";
import { libraryPath } from "@/lib/title-form";
import { ToastProvider } from "@/lib/toast-context";

export const metadata: Metadata = {
  title: "Draft Preview · Gayflix Admin",
};

export default async function AdminDraftPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const session = await getSession();
  const library = session ? await loadLibrary(session.user.id) : null;
  const { id } = await params;
  const title = await getDraftTitleForPreview(id);
  if (!title) notFound();

  return (
    <ToastProvider>
      <LibraryProviders userId={session?.user.id ?? null} library={library}>
        <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col">
          {/* Draft Preview Admin Banner */}
          <div className="sticky top-0 z-50 flex items-center justify-between border-b border-brand-pink/30 bg-bg-surface/95 px-6 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="flex items-center gap-1 rounded-full bg-brand-pink/15 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-ink-brand border border-brand-pink/30">
                <Eye className="h-3 w-3" />
                Draft Preview
              </span>
              <span className="text-ink-secondary">
                Viewing &ldquo;{title.title}&rdquo; · Not visible to public (Status: {title.status})
              </span>
            </div>
            <Link
              href={`${libraryPath(title.type)}/${title.id}`}
              className="flex items-center gap-1 text-xs font-semibold text-ink-secondary hover:text-ink-brand underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Return to editor
            </Link>
          </div>

          <Header />
          <NavMenu />
          <div className="flex-1">
            <TitleDetail title={title} recommended={[]} />
          </div>
          <Footer />
        </div>
      </LibraryProviders>
    </ToastProvider>
  );
}

