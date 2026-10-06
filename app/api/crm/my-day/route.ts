import { crmRoute } from "@/lib/crm/http";
import { getMyDay } from "@/lib/crm/my-day";

// GET /api/crm/my-day[?userId=] — tareas, citas, chats sin responder y negocios sin
// siguiente paso. `userId` (solo admin/usuario) muestra el día de otro miembro.
export const GET = crmRoute(async ({ req, actor }) => getMyDay(actor, new URL(req.url).searchParams.get("userId")));
