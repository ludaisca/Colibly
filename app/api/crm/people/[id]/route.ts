import { crmRoute, readJson } from "@/lib/crm/http";
import { deletePerson, getPersonDetail, updatePerson } from "@/lib/crm/people";

type P = { id: string };

// Ficha del contacto: datos, empresa, responsable, canales a los que tienes
// acceso, próximas citas e historial reciente.
export const GET = crmRoute<P>(async ({ actor, params }) => getPersonDetail(actor, params.id));

// Edición con control de versión: el cuerpo trae `expectedVersion`; si alguien
// cambió el registro antes, responde 409 `version_conflict` con el vigente.
export const PATCH = crmRoute<P>(async ({ req, actor, params }) => updatePerson(actor, params.id, await readJson(req)));

// Borrado definitivo (solo admin).
export const DELETE = crmRoute<P>(async ({ actor, params }) => ({ ok: true, ...(await deletePerson(actor, params.id)) }));
