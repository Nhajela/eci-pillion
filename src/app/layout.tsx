import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { BetaFab } from "@/components/beta-fab";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import "./globals.css";

const display = Fredoka({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const body = Nunito({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_ORIGIN ?? "https://pillion.housefulloflove.com"),
  title: "Pillion (beta) · rides across the village",
  description:
    "Your scooty has a lonely back seat. Share rides across Mandrem, earn kaju, win small daily prizes. Edge City India 2026.",
  openGraph: {
    title: "Pillion · your scooty has a lonely back seat",
    description: "Share rides across the village. Earn kaju. Meet one person.",
    images: ["/art/hero.webp"],
  },
};

export const viewport: Viewport = { themeColor: "#fdf1d8" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <BetaFab loggedIn={Boolean(user)} bot={env.botUsername()} />
      </body>
    </html>
  );
}
