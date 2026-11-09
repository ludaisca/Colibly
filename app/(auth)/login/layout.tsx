import type { Metadata } from "next";

// La página es de cliente: el título de la pestaña vive aquí.
export const metadata: Metadata = { title: "Entrar" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
