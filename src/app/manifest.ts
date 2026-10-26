import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/page-metadata";

/**
 * The web app manifest (A17), served at /manifest.webmanifest: what lets
 * phones and Chrome add Gayflix to the home screen or install it, and
 * open it full screen at Home. The icons are made from
 * public/brand/gayflix-icon.png on the page's background color; the
 * maskable one keeps the art inside the safe zone Android crops to.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gayflix",
    short_name: "Gayflix",
    description: SITE_DESCRIPTION,
    id: "/home",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    categories: ["entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
