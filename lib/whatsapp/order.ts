import type { StructuredContent } from "@/lib/whatsapp/message-content";

type Order = NonNullable<StructuredContent["order"]>;

/**
 * Total de un pedido del carrito: suma de precio × cantidad, en una sola
 * moneda. null si algún producto no trae precio o cantidad, o si mezcla
 * monedas (no se adivina). Redondeado a centavos. Pura.
 */
export function orderTotal(order: Order): { total: number | null; currency: string | null } {
  const currencies = new Set(order.items.map((i) => i.currency).filter(Boolean));
  const currency = currencies.size === 1 ? [...currencies][0]! : null;
  if (order.items.length === 0 || currencies.size > 1) return { total: null, currency };
  let total = 0;
  for (const i of order.items) {
    if (i.price === null || i.quantity === null) return { total: null, currency };
    total += i.price * i.quantity;
  }
  return { total: Math.round(total * 100) / 100, currency };
}
