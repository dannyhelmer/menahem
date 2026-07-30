import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo/constants";

export const alt = SITE_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BURGUNDY = "#7a1f2b";

export default async function Image() {
  const logoData = await readFile(join(process.cwd(), "public", "menahem-logo.png"), "base64");
  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "#ffffff",
          padding: "0 100px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og's ImageResponse requires a plain <img>, not next/image */}
        <img src={logoSrc} width={140} height={140} alt="" />
        <div style={{ fontSize: 56, fontWeight: 600, color: "#171717", textAlign: "center" }}>
          Government Intelligence Platform
        </div>
        <div style={{ fontSize: 28, color: "#525252", textAlign: "center", maxWidth: 900 }}>
          {SITE_DESCRIPTION}
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: BURGUNDY, marginTop: 8 }}>menahem.dev</div>
      </div>
    ),
    { ...size },
  );
}
