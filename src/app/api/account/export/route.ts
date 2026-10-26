import { NextResponse } from "next/server";
import { exportAccount } from "@/lib/account-export";
import { getSession } from "@/lib/session";

/**
 * "Download my data" (Account → Setting): the signed-in account's data
 * as a JSON file (src/lib/account-export.ts). Never cached; guests get 401.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const data = await exportAccount(session.user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gayflix-data-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
