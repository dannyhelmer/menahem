import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConversationsProvider } from "./_components/ConversationsProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Menahem",
  description: "Menahem, your AI research assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConversationsProvider>{children}</ConversationsProvider>
      </body>
    </html>
  );
}
