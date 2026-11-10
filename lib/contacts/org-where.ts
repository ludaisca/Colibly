// Contactos "reales" de una organización: los de sus cuentas de WhatsApp, los
// de sus canales y los que aún no tienen canal; nunca los de ejemplo. Es la
// base de los conteos y límites del plan (sin imports: la usan gates y workers).
export function orgContactsWhere(organizationId: string) {
  return {
    isSample: false,
    OR: [{ account: { organizationId } }, { channelAccount: { organizationId } }, { accountId: null, channelAccountId: null, organizationId }],
  };
}
