import type { Metadata } from "next";
import SignUpForm from "./_components/SignUpForm";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your Menahem account. Menahem is currently offered as a private beta.",
  alternates: { canonical: "/signup" },
};

export default function SignUpPage() {
  return <SignUpForm />;
}
