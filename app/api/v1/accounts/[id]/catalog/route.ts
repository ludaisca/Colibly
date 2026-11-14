import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiCommerceSettingsSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { getCommerceSettings, listWabaCatalogs, updateCommerceSettings } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

// Cada parte por separado: en los números de coexistencia Meta no deja leer
// el catálogo (SMB_CATALOG_MESSAGE) pero los ajustes pueden responder igual.
// Una parte que falla viaja en `notices` y deja su campo en null; si fallan
// las dos, la respuesta es el error de la primera.
async function current(account: Parameters<typeof listWabaCatalogs>[0] & { id: string }) {
  const [catalogs, settings] = await Promise.allSettled([listWabaCatalogs(account), getCommerceSettings(account)]);
  if (catalogs.status === "rejected" && settings.status === "rejected") throw catalogs.reason;
  const notices = [catalogs, settings].flatMap((r) => (r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []));
  return {
    accountId: account.id,
    catalogs: catalogs.status === "fulfilled" ? catalogs.value : null,
    cartEnabled: settings.status === "fulfilled" ? settings.value.cartEnabled : null,
    catalogVisible: settings.status === "fulfilled" ? settings.value.catalogVisible : null,
    notices,
  };
}

// GET/PATCH /api/v1/accounts/{id}/catalog — el catálogo de Meta conectado a la
// cuenta (se conecta en el Administrador de WhatsApp) y los ajustes del
// número: carrito (el cliente arma un pedido en el chat, llega como mensaje
// `order`) y catálogo visible (botón de tienda en el perfil y el chat).
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    return apiOk(await current(account));
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiCommerceSettingsSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);
  try {
    await updateCommerceSettings(account, body);
    return apiOk(await current(account));
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET", "PATCH");
export const PUT = POST;
export const DELETE = POST;
