"use client";

import { ClipboardList, ShoppingCart, UserRound } from "lucide-react";
import { flowFields } from "@/lib/whatsapp/flow-fields";
import { orderTotal } from "@/lib/whatsapp/order";
import type { StructuredContent } from "@/lib/whatsapp/message-content";

// Burbujas de mensajes con contenido estructurado de WhatsApp (WAMessage.content):
// respuesta de un Flow, pedido del carrito y tarjetas de contacto.

const MAX_FIELDS = 12;

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-accent-ink">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-darker">{subtitle}</p>}
      </div>
    </div>
  );
}

export function FlowResponseContent({ response }: { response: NonNullable<StructuredContent["flowResponse"]> }) {
  const fields = flowFields(response.data);
  const shown = fields.slice(0, MAX_FIELDS);
  return (
    <div className="w-[280px] max-w-full space-y-2">
      <Header icon={<ClipboardList size={18} aria-hidden />} title="Respondió el formulario" subtitle={response.raw ? "Respuesta sin formato" : null} />
      {shown.length > 0 ? (
        <dl className="space-y-1 rounded-lg bg-surface px-2.5 py-2 text-xs">
          {shown.map((f, i) => (
            <div key={`${f.label}-${i}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
              <dt className="truncate text-muted-darker" title={f.label}>{f.label}</dt>
              <dd className="break-words text-foreground">{f.value}</dd>
            </div>
          ))}
          {fields.length > shown.length && <p className="text-muted-darker">y {fields.length - shown.length} campo(s) más</p>}
        </dl>
      ) : (
        <p className="text-xs text-muted-darker">{response.raw ? response.raw.slice(0, 300) : "Sin campos"}</p>
      )}
    </div>
  );
}

function money(value: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency ?? "MXN" }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

export function OrderContent({ order }: { order: NonNullable<StructuredContent["order"]> }) {
  const { total, currency } = orderTotal(order);
  const count = order.items.reduce((n, i) => n + (i.quantity ?? 0), 0);
  return (
    <div className="w-[280px] max-w-full space-y-2">
      <Header icon={<ShoppingCart size={18} aria-hidden />} title={`Pedido · ${count} ${count === 1 ? "producto" : "productos"}`} subtitle={order.text} />
      <ul className="space-y-1 rounded-lg bg-surface px-2.5 py-2 text-xs">
        {order.items.map((item, i) => (
          <li key={`${item.productId}-${i}`} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-foreground" title={item.productId ?? undefined}>
              {item.quantity ?? "?"} × {item.productId ?? "Producto"}
            </span>
            {item.price !== null && <span className="shrink-0 tabular-nums text-muted-darker">{money(item.price, item.currency)}</span>}
          </li>
        ))}
        {total !== null && (
          <li className="flex items-baseline justify-between gap-2 border-t border-border pt-1 font-medium text-foreground">
            <span>Total</span>
            <span className="tabular-nums">{money(total, currency)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

export function ContactsContent({ contacts }: { contacts: NonNullable<StructuredContent["contacts"]> }) {
  return (
    <div className="w-[260px] max-w-full space-y-2">
      {contacts.map((c, i) => (
        <div key={i} className="space-y-1">
          <Header icon={<UserRound size={18} aria-hidden />} title={c.name ?? "Contacto"} subtitle={c.company} />
          {(c.phones.length > 0 || c.emails.length > 0) && (
            <ul className="space-y-0.5 pl-11 text-xs text-muted-darker">
              {c.phones.map((p, j) => (
                <li key={`p${j}`} className="font-mono tabular-nums">{p.phone ?? p.waId}{p.type ? ` · ${p.type.toLowerCase()}` : ""}</li>
              ))}
              {c.emails.map((e) => (
                <li key={e} className="truncate">{e}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
