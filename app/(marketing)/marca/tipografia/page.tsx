import type { Metadata } from "next";
import { TypographyPairs } from "./_pairs";

export const metadata: Metadata = {
  title: "Tipografía · Colibly",
  robots: { index: false, follow: false },
};

export default function TipografiaPage() {
  return <TypographyPairs />;
}
