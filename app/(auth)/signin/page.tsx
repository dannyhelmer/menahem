import type { Metadata } from "next";
import SignInForm from "./_components/SignInForm";
import { PAGE_SEO } from "@/lib/seo/constants";

const { title, description } = PAGE_SEO.signin;

export const metadata: Metadata = {
  title,
  description,
  keywords: ["Menahem sign in", "government research login"],
  alternates: { canonical: "/signin" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "/signin", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function SignInPage() {
  return <SignInForm />;
}
