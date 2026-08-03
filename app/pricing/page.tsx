import type { Metadata } from "next";
import PricingContent from "./_components/PricingContent";
import { PAGE_SEO } from "@/lib/seo/constants";

const { title, description } = PAGE_SEO.pricing;

export const metadata: Metadata = {
  title,
  description,
  keywords: ["Menahem pricing", "government research pricing", "AI legislative analysis plans", "policy research subscription"],
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "/pricing", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function PricingPage() {
  return <PricingContent />;
}