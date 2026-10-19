import { redirect } from "next/navigation";

// /docs no tiene índice propio todavía: la única documentación es la de la API.
export default function DocsIndex() {
  redirect("/docs/api");
}
