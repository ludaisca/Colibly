import { notFound, redirect } from "next/navigation";
import { CrmError } from "@/lib/crm/errors";
import { getActor } from "@/lib/crm/access";
import { getPersonDetail } from "@/lib/crm/people";
import { PersonView, type PersonDetail } from "./_view";

// Ficha completa de un contacto (persona). Se lee en el servidor con las mismas
// reglas de rol que la API (`getPersonDetail`): un ejecutivo ve el contacto pero
// solo sus negocios y citas, y un id que no existe o no es de tu organización
// responde 404.
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail;
  try {
    const actor = await getActor();
    detail = await getPersonDetail(actor, id);
  } catch (error) {
    if (error instanceof CrmError && error.status === 401) redirect("/login");
    if (error instanceof CrmError && error.status === 404) notFound();
    throw error;
  }
  // Las fechas viajan como texto al componente de cliente.
  return <PersonView initial={JSON.parse(JSON.stringify(detail)) as PersonDetail} />;
}
