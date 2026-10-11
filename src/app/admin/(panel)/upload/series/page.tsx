import AddTitlePage from "@/components/admin/AddTitlePage";
import { requireAdmin } from "@/lib/session";

export default async function UploadSeriesPage() {
  await requireAdmin();
  return <AddTitlePage type="series" />;
}
