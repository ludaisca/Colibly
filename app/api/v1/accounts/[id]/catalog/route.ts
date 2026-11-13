import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiCommerceSettingsSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError } from "@/lib/api/whatsapp-admin";
import { getCommerceSettings, listWabaCatalogs, updateCommerceSettings } from "@/lib/whatsapp/account-admin";

type Params = { params: Promise<{ id: string }> };

async function current(account: Parameters<typeof listWabaCatalogs>[0] & { id: string }) {
  const [catalogs, settings] = await Promise.all([listWabaCatalogs(account), getCommerceSettings(account)]);
  return { accountId: account.id, catalogs, ...settings };
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
