import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({ 
  subsets: ["latin"], 
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  adjustFontFallback: false
});

export const metadata: Metadata = {
  title: "Sumly — AI Summarizer",
  description: "Secure proxy server for the Sumly Chrome Extension",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${newsreader.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
