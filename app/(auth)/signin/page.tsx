import type { Metadata } from "next";
import SignInForm from "./_components/SignInForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Menahem account.",
  alternates: { canonical: "/signin" },
};

export default function SignInPage() {
  return <SignInForm />;
}
