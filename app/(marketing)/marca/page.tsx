import type { Metadata } from "next";
import { BrandProposals } from "./_proposals";

export const metadata: Metadata = {
  title: "Propuestas de color · Colibly",
  robots: { index: false, follow: false },
};

export default function MarcaProposalsPage() {
  return <BrandProposals />;
}
