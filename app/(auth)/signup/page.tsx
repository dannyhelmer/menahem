import type { Metadata } from "next";
import SignUpForm from "./_components/SignUpForm";
import { PAGE_SEO } from "@/lib/seo/constants";

const { title, description } = PAGE_SEO.signup;

export const metadata: Metadata = {
  title,
  description,
  keywords: ["Menahem sign up", "create government research account", "AI legislative research account"],
  alternates: { canonical: "/signup" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "/signup", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function SignUpPage() {
  return <SignUpForm />;
}
