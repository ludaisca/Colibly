import type { MetaSharedContact } from "@/lib/whatsapp/message-content";

// Tarjetas de contacto que se mandan por WhatsApp (type "contacts"): de la
// forma de la API pública a la de Meta. Meta exige formatted_name y al menos
// otro campo del nombre, así que first_name se toma del nombre si no viene.

export interface SharedContactInput {
  name: string;
  firstName?: string;
  lastName?: string;
  phones?: { phone: string; type?: string; waId?: string }[];
  emails?: { email: string; type?: string }[];
  company?: string;
  title?: string;
  urls?: { url: string; type?: string }[];
  birthday?: string;
}

/** Forma de Meta para enviar. Pura. */
export function toMetaContacts(contacts: SharedContactInput[]): Record<string, unknown>[] {
  return contacts.map((c) => {
    const out: Record<string, unknown> = {
      name: { formatted_name: c.name, first_name: c.firstName ?? (c.lastName ? undefined : c.name), ...(c.lastName ? { last_name: c.lastName } : {}) },
    };
    if (c.phones?.length) out.phones = c.phones.map((p) => ({ phone: p.phone, ...(p.type ? { type: p.type } : {}), ...(p.waId ? { wa_id: p.waId } : {}) }));
    if (c.emails?.length) out.emails = c.emails.map((e) => ({ email: e.email, ...(e.type ? { type: e.type } : {}) }));
    if (c.company || c.title) out.org = { ...(c.company ? { company: c.company } : {}), ...(c.title ? { title: c.title } : {}) };
    if (c.urls?.length) out.urls = c.urls.map((u) => ({ url: u.url, ...(u.type ? { type: u.type } : {}) }));
    if (c.birthday) out.birthday = c.birthday;
    return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
  });
}

/** Misma forma que un contacto recibido, para el texto y `content` del mensaje guardado. */
export function asReceivedContacts(contacts: SharedContactInput[]): MetaSharedContact[] {
  return toMetaContacts(contacts) as MetaSharedContact[];
}
