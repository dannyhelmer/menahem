import type { Metadata } from "next";
import PricingContent from "./_components/PricingContent";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Choose your Menahem plan. Start free and upgrade for faster, deeper, and more powerful government intelligence.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <PricingContent />;
}