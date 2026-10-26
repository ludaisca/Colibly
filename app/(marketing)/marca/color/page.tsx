import type { Metadata } from "next";
import { ColorPalettes } from "./_palettes";

export const metadata: Metadata = {
  title: "Color · Colibly",
  robots: { index: false, follow: false },
};

export default function ColorLabPage() {
  return <ColorPalettes />;
}
