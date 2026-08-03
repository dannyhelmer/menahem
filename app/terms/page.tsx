import type { Metadata } from "next";
import LegalPageLayout, { LegalSection } from "@/app/_components/LegalPageLayout";

const title = "Terms of Service";
const description = "The terms governing use of Menahem's private beta.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["Menahem terms of service", "government research platform terms"],
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "/terms", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="July 30, 2026">
      <p>Welcome to Menahem.</p>
      <p>By creating an account or using the platform, you agree to these Terms.</p>

      <LegalSection heading="Private Beta">
        <p>Menahem is currently offered as a private beta.</p>
        <p>Features may:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Change without notice</li>
          <li>Be temporarily unavailable</li>
          <li>Contain bugs or inaccuracies</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Accounts">
        <p>You agree to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide accurate registration information</li>
          <li>Keep your password secure</li>
          <li>Be responsible for activity on your account</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Acceptable Use">
        <p>You may not:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Attempt to gain unauthorized access</li>
          <li>Abuse or interfere with the platform</li>
          <li>Upload malicious software</li>
          <li>Use the service for unlawful purposes</li>
          <li>Attempt to reverse engineer or exploit the platform</li>
        </ul>
      </LegalSection>

      <LegalSection heading="AI Responses">
        <p>Menahem provides AI-assisted research.</p>
        <p>
          While we strive for accuracy, AI-generated responses may contain errors and should not be considered
          legal, financial, or professional advice. Users are responsible for verifying important information.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual Property">
        <p>
          The Menahem platform, branding, logo, software, and original content are the property of Menahem
          unless otherwise stated.
        </p>
      </LegalSection>

      <LegalSection heading="Account Suspension">
        <p>
          We reserve the right to suspend or terminate accounts that violate these Terms or threaten the security
          or integrity of the platform.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer">
        <p>Menahem is provided &quot;as is&quot; without warranties of any kind, to the fullest extent permitted by applicable law.</p>
      </LegalSection>

      <LegalSection heading="Limitation of Liability">
        <p>
          To the maximum extent permitted by law, Menahem shall not be liable for indirect, incidental,
          consequential, or special damages arising from the use of the platform.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to These Terms">
        <p>
          We may modify these Terms from time to time. Continued use of Menahem after changes become effective
          constitutes acceptance of the revised Terms.
        </p>
      </LegalSection>

      <LegalSection heading="Governing Law">
        <p>
          These Terms shall be governed by the laws of the State of Illinois, United States, without regard to
          conflict of law principles.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions regarding these Terms may be directed to:{" "}
          <a href="mailto:support@menahem.dev" className="text-burgundy hover:underline">
            support@menahem.dev
          </a>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
