import { Suspense } from "react";
import { ContactsView } from "./_view";
import ContactsLoading from "./loading";

// Directorio de contactos (personas) de la organización. La lista y sus filtros
// viven en el cliente porque se guardan en la URL (`useSearchParams`).
export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsLoading />}>
      <ContactsView />
    </Suspense>
  );
}
