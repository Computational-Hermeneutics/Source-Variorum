import type { Metadata } from "next";
import { Inter, Libre_Baskerville, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-libre-baskerville",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Source Variorum — Computational Hermeneutics",
  description:
    "A side-by-side textual collation workbench. Collate two or more witnesses of a text — source code or prose — and read additions, deletions, substitutions, and transpositions in a braided variorum view. An instrument in the Computational Hermeneutics family.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${libreBaskerville.variable} ${sourceSerif.variable} antialiased font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
