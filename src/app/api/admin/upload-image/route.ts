import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { imageHosts, uploadHost } from "@/lib/image-hosts.mjs";
import {
  IMAGE_SIZE_PROBLEM,
  IMAGE_TYPE_PROBLEM,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  sniffImageType,
} from "@/lib/image-upload";
import { requireAdmin } from "@/lib/session";
import { imageUrlProblem } from "@/lib/title-form";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const form = await request.formData();
    const kind = form.get("kind");
    const file = form.get("file");
    if ((kind !== "poster" && kind !== "backdrop") || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
    }
    if (!uploadHost()) {
      return NextResponse.json(
        { error: "Uploads aren't set up on this site. Paste a link instead." },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: IMAGE_SIZE_PROBLEM }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) {
      return NextResponse.json({ error: IMAGE_TYPE_PROBLEM }, { status: 400 });
    }

    const { url } = await put(`${kind}s/${kind}.${IMAGE_TYPES[type]}`, bytes, {
      access: "public",
      contentType: type,
      addRandomSuffix: true,
    });

    if (imageUrlProblem(url, imageHosts())) {
      return NextResponse.json(
        { error: "The image was stored, but this site can't show it. Paste a link instead." },
        { status: 400 }
      );
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[uploads] storing an image failed:", error);
    return NextResponse.json({ error: "The upload didn't go through. Try again." }, { status: 500 });
  }
}

