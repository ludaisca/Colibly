import type { Metadata } from "next";
import { LogoConcepts } from "./_marks";

export const metadata: Metadata = {
  title: "Propuestas de logo · Colibly",
  robots: { index: false, follow: false },
};

export default function MarcaLogoPage() {
  return <LogoConcepts />;
}
