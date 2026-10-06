import { crmRoute } from "@/lib/crm/http";
import { listTeam } from "@/lib/crm/people";

// Usuarios activos de tu organización (para elegir responsable).
export const GET = crmRoute(async ({ actor }) => ({ items: await listTeam(actor) }));
