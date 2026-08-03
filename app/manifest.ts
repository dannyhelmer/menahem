import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} | Government Intelligence Platform`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7a1f2b",
    icons: [
      {
        src: "/menahem-logo.png",
        sizes: "256x256",
        type: "image/png",
      },
    ],
  };
}
