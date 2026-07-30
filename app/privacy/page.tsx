import type { Metadata } from "next";
import LegalPageLayout, { LegalSection } from "@/app/_components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Menahem collects, uses, and protects your account and research information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="July 30, 2026">
      <p>
        Welcome to Menahem (&quot;Menahem,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We value
        your privacy and are committed to protecting your personal information.
      </p>

      <LegalSection heading="Information We Collect">
        <p>When you create an account, we may collect:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Email address</li>
          <li>Encrypted (hashed) password</li>
          <li>Account preferences</li>
          <li>Research history associated with your account</li>
          <li>Technical information such as browser type, device information, and IP address for security and diagnostics</li>
        </ul>
      </LegalSection>

      <LegalSection heading="How We Use Your Information">
        <p>We use your information to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Provide access to Menahem</li>
          <li>Authenticate your account</li>
          <li>Improve platform performance</li>
          <li>Maintain platform security</li>
          <li>Respond to support requests</li>
          <li>Develop new features</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Password Security">
        <p>
          Passwords are securely hashed before being stored. Menahem does not store your password in plain text.
        </p>
      </LegalSection>

      <LegalSection heading="Data Sharing">
        <p>We do not sell your personal information.</p>
        <p>We may share information only when:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Required by law</li>
          <li>Necessary to protect the security of the platform</li>
          <li>Working with trusted service providers (such as hosting, authentication, or AI providers) that help operate Menahem</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Data Retention">
        <p>
          We retain account information while your account remains active or as necessary to comply with legal
          obligations.
        </p>
      </LegalSection>

      <LegalSection heading="Your Rights">
        <p>You may request:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Access to your account information</li>
          <li>Correction of inaccurate information</li>
          <li>Deletion of your account, subject to legal or operational requirements</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          We use industry-standard security measures, including encrypted connections (HTTPS), secure
          authentication, and reasonable safeguards designed to protect user information. However, no internet
          service can guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update this Privacy Policy periodically. Continued use of Menahem constitutes acceptance of the
          updated policy.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions regarding this Privacy Policy may be directed to:{" "}
          <a href="mailto:support@menahem.dev" className="text-burgundy hover:underline">
            support@menahem.dev
          </a>
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
