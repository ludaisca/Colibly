import type { Metadata } from "next";
import { connection } from "next/server";
import { BRAND_NAME } from "@/lib/brand";
import { siteUrl } from "@/lib/app-url";
import ExistingLanding from "../page";

// Conserva la landing anterior para comparación sin competir en buscadores con
// la beta que se muestra en la raíz del dominio público.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { title: `${BRAND_NAME} · Vista anterior`, alternates: { canonical: siteUrl("/producto") }, robots: { index: false, follow: false } };
}

export default function ProductPreview() { return <ExistingLanding />; }
