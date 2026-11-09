import type { Metadata } from "next";

// La página es de cliente: el título de la pestaña vive aquí.
export const metadata: Metadata = { title: "Confirmar correo" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
