import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BidEasy — estimates that price themselves",
  description: "Zero-setup estimating for residential-renovation GCs",
};

// Set the theme before paint to avoid a flash: honor a saved choice, else the
// OS preference.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`;

// Set the saved side-nav state before paint so the sidebar renders at the right
// width immediately (no expand→collapse flash for collapsed users).
const navScript = `(function(){try{var n=localStorage.getItem('nav');document.documentElement.dataset.nav=(n==='collapsed'?'collapsed':'expanded')}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: navScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
