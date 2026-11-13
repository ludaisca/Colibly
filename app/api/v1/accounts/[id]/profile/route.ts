import { authenticateApiKey } from "@/lib/api/auth";
import { apiOk, methodNotAllowed, readJsonBody, withApiErrors } from "@/lib/api/respond";
import { apiBusinessProfileSchema } from "@/lib/api/schemas";
import { enforceWhatsAppAdminLimit, loadApiWhatsAppAccount, toWhatsAppAdminApiError, uploadRemoteFileToMeta } from "@/lib/api/whatsapp-admin";
import { getBusinessProfile, updateBusinessProfile } from "@/lib/whatsapp/account-admin";
import { OUTBOUND_MEDIA_RULES } from "@/lib/messaging/outbound-media";

type Params = { params: Promise<{ id: string }> };

// GET/PATCH /api/v1/accounts/{id}/profile — el perfil de empresa que ven los
// clientes en WhatsApp (descripción, dirección, correo, sitios, categoría y
// foto). Se lee y se escribe directo en Meta: Colibly no guarda copia.
export const GET = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  try {
    return apiOk({ accountId: account.id, ...(await getBusinessProfile(account)) });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const PATCH = withApiErrors(async (req: Request, { params }: Params) => {
  const ctx = await authenticateApiKey(req, "whatsapp:manage");
  const body = await readJsonBody(req, apiBusinessProfileSchema);
  const { id } = await params;
  const account = await loadApiWhatsAppAccount(ctx, id);
  await enforceWhatsAppAdminLimit(req, ctx);

  const { profilePictureUrl, ...fields } = body;
  try {
    const profilePictureHandle = profilePictureUrl
      ? await uploadRemoteFileToMeta(account, "profilePictureUrl", profilePictureUrl, OUTBOUND_MEDIA_RULES.image)
      : undefined;
    await updateBusinessProfile(account, { ...fields, profilePictureHandle });
    // Meta puede tardar unos segundos en reflejar la foto nueva en profilePictureUrl.
    return apiOk({ accountId: account.id, ...(await getBusinessProfile(account)) });
  } catch (err) {
    toWhatsAppAdminApiError(err);
  }
});

export const POST = methodNotAllowed("GET", "PATCH");
export const PUT = POST;
export const DELETE = POST;
