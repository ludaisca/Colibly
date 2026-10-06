import { crmRoute } from "@/lib/crm/http";
import { listDuplicateClusters } from "@/lib/crm/people";

// Grupos de contactos que comparten correo o teléfono (52…/521… cuentan igual).
export const GET = crmRoute(async ({ actor }) => listDuplicateClusters(actor));
