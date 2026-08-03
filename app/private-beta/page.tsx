import type { Metadata } from "next";
import PrivateBetaContent from "./_components/PrivateBetaContent";

// Account-status page for a signed-in-but-unapproved user -- no search
// value, and already excluded in robots.txt, but this explicit noindex is
// defense in depth (this page previously had no metadata at all since it
// was a client component, which can't export one).
export const metadata: Metadata = {
  title: "Private Beta",
  description: "Your Menahem account is awaiting private beta approval.",
  robots: { index: false, follow: false },
};

export default function PrivateBetaPage() {
  return <PrivateBetaContent />;
}
