import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout, { LegalSection } from "@/app/_components/LegalPageLayout";
import { PAGE_SEO } from "@/lib/seo/constants";

const { title, description } = PAGE_SEO.about;

export const metadata: Metadata = {
  title,
  description,
  keywords: ["about Menahem", "government research platform", "AI policy research", "legislative analysis tool"],
  alternates: { canonical: "/about" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "/about", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function AboutPage() {
  return (
    <LegalPageLayout title="About Menahem" maxWidthClassName="max-w-[900px]">
      <LegalSection heading="Government Intelligence Platform">
        <p>
          Menahem is an AI-powered Government Intelligence Platform designed to help people research,
          understand, and analyze government. It combines artificial intelligence with official government
          sources to make legislation, public policy, court decisions, and public records easier to explore.
        </p>
        <p>
          Our goal is to help students, journalists, researchers, public officials, educators, and engaged
          citizens access trustworthy government information more efficiently.
        </p>
      </LegalSection>

      <LegalSection heading="What Menahem Can Do">
        <ul className="list-disc space-y-1 pl-5">
          <li>Research legislation and bills</li>
          <li>Explain public policy</li>
          <li>Analyze court opinions</li>
          <li>Search official government documents</li>
          <li>Compare laws and constitutions</li>
          <li>Organize research into workspaces</li>
          <li>Analyze uploaded PDFs and images</li>
          <li>Support deep government research with AI</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Our Approach">
        <p>
          Menahem is designed to prioritize official sources whenever possible. AI responses should assist
          research—not replace critical thinking or primary source verification.
        </p>
        <p>Government information should be accessible, understandable, and transparent.</p>
      </LegalSection>

      <LegalSection heading="Private Beta">
        <p>Menahem is currently in private beta.</p>
        <p>Features may change as we continue improving the platform based on user feedback.</p>
      </LegalSection>

      <LegalSection heading="Our Mission">
        <p>
          To make government information more accessible, understandable, and useful through modern AI-powered
          research tools.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer">
        <p>Menahem is an independent software platform.</p>
        <p>It is not affiliated with, endorsed by, or operated by any government agency.</p>
        <p>
          AI-generated responses may contain mistakes. Users should verify important information using official
          government sources.
        </p>
      </LegalSection>

      <LegalSection heading="Legal">
        <p>
          <Link href="/privacy" className="text-burgundy hover:underline">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/terms" className="text-burgundy hover:underline">
            Terms of Service
          </Link>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
