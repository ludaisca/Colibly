# Precio por ejecutivo (asientos), 2026-10-19

**Vigente.** Decisión de Luis (dueño): se cobra **por ejecutivo**. Reemplaza el esquema por organización (Básico 5 USD / Pro 10 USD), que queda superado. Fuente única de números: `lib/billing/plans.ts`.

## Oferta

| | Básico | Pro |
|---|---|---|
| Precio | **149 MXN por ejecutivo al mes** | **299 MXN por ejecutivo al mes** |
| WhatsApp | 1 número por ejecutivo (Coexistencia) | 1 número por ejecutivo (Coexistencia) |
| Contactos (bolsa) | 1,000 × ejecutivos | 5,000 × ejecutivos |
| Créditos de IA al mes (bolsa) | 300 × ejecutivos | 1,000 × ejecutivos |
| Automatizaciones activas | 5 por organización | Ilimitadas |
| Telegram/Messenger/Instagram | 1 por organización, por habilitación | 3 por organización, por habilitación |
| API y webhooks | No | Sí |

- Solo mensual, sin plan anual. Moneda MXN.
- **Sin leyenda fiscal**: la empresa no factura; la copia dice solo "MXN por ejecutivo al mes", nunca "incluye IVA" ni "verás el precio final con impuestos". El único interruptor es `PRICE_TAX_NOTE` en `plans.ts` (hoy `null`); si se le pone texto aparece junto a cada precio (landing, `/precios`, `/beta`, términos, pantalla del plan y cPanel).
- Meta cobra aparte algunos mensajes; lo paga el cliente directamente a Meta (`META_FEES_NOTE` en `plan-features.ts`).
- Prueba: `TRIAL_DAYS` = 30, plan Pro, sin tarjeta, hasta `TRIAL_MAX_SEATS` = 3 ejecutivos (los límites por asiento se calculan con 3).

## Reglas

- **Asiento** = cada usuario activo de la organización (dueño, admins, usuarios y ejecutivos: todos pueden atender) + cada invitación pendiente. Desactivar a alguien o revocar una invitación libera el asiento.
- **Tope de asientos** (`state.ts:seatCap()`): interna = sin tope; `TRIALING` = `TRIAL_MAX_SEATS`; si no, `Organization.seatQuantity` (= quantity de la suscripción de Stripe, mínimo 1).
- **Agregar un ejecutivo de más** (crear, invitar, reactivar, aceptar invitación) responde 402 `code: "plan_limit"`, `limit: "seats"` y `billingUrl: "/configuracion/plan#asientos"`; los modales de Usuarios muestran el enlace "Agregar ejecutivos en Plan y facturación".
- **WhatsApp**: `limit: "whatsapp"` = 1 × asientos, contando todos los `WAAccount` de la organización (alta manual y Embedded Signup). `WAAccount.userId` ya existe, pero es **quien conectó** el número (los ejecutivos no pueden conectar cuentas: `forbidRoles(["ejecutivo"])`); por eso NO se agregó `ownerUserId` ni un tope de 1 por `userId`: bloquearía al admin que conecta los números de su equipo. El número se le da al ejecutivo con "Compartir cuenta" (`WAAccountShare`).
- **Otros canales** (Telegram/Messenger/Instagram): siguen detrás de los flags por organización de `/plataforma` y con un tope por organización (`perOrg.otherChannels`: Básico 1, Pro 3, los números del tope de canales anterior), ahora separado de WhatsApp. El widget web no cuenta.
- **Contactos y créditos de IA**: bolsa de la organización = por asiento × `seatCap()`. Al agregar asientos crece al instante; al quitar, baja al instante (los créditos se siguen reiniciando con `invoice.paid`).

## Stripe

- Cada plan = un precio recurrente **mensual en MXN por unidad** (`stripePriceBasic`, `stripePricePro` en `/plataforma`, etiquetados "MXN por ejecutivo/mes"). La suscripción lleva un solo item con `quantity` = asientos. `syncSubscription()` avisa en logs si el precio no está en `mxn`.
- **Alta**: `POST /api/billing/checkout {plan, seats, confirm}`; `seats` ≥ asientos ocupados. Durante la prueba con >48 h restantes el primer cobro se difiere al fin de la prueba (igual que antes).
- **Cambio de plan o asientos**: `POST /api/billing/subscription {plan, seats, confirm}` → `lib/billing/seats.ts:applyPlanChange()` → `stripe.subscriptions.update(items: [{id, price, quantity}], proration_behavior: "create_prorations")` y resincroniza.
- **Webhook**: `customer.subscription.updated` (y todos los demás) relee la suscripción; `deriveFromSubscription()` copia `items[0].quantity` a `Organization.seatQuantity` (migración `20261019142134_seat_quantity`). Así también entra un cambio hecho en el portal o el dashboard de Stripe.

## Bajar de plan o de asientos (`state.ts:planChangeImpact()`)

Bloquean (no se puede confirmar):
- menos asientos que los ocupados (usuarios activos + invitaciones);
- más números de WhatsApp que asientos;
- Básico con más de 5 automatizaciones activas.

Avisan y piden confirmación (`code: "confirm_required"`):
- la API y los webhooks dejan de funcionar en Básico (cuántas claves y webhooks);
- contactos por encima del nuevo tope: se conservan, pero no se agregan nuevos;
- canales adicionales por encima del tope: siguen conectados, no se agregan más.

La pantalla "Plan y facturación" calcula lo mismo en vivo (misma función) y la API lo vuelve a evaluar.

## Copias públicas

- Next: `/`, `/precios`, `/beta`, `/terminos`, imagen para compartir y correo de bienvenida leen `plans.ts`/`plan-features.ts`.
- cPanel: `node scripts/gen-cpanel-pricing.mjs` (dentro del contenedor app) genera `cpanel-site/pricing.generated.php` y el bloque marcado de `cpanel-site/llms.txt`; `precios.php`, `index.php` y `terminos.php` incluyen el PHP generado. `lib/billing/__tests__/cpanel-pricing.test.ts` falla si están desactualizados o si una página de cPanel vuelve a escribir precios, USD o impuestos a mano. Al publicar cPanel hay que subir también `pricing.generated.php`.
- `lib/billing/__tests__/public-copy.test.ts` falla si las páginas de Next vuelven a decir USD o hablan de impuestos/precio final.

## Pendiente / por decidir

- Coexistencia sigue detrás de `Organization.whatsappCoexistenceEnabled` (apagado por defecto). La copia la presenta como función principal: hay que encenderla por defecto (o para cada cliente) antes de publicar, o la copia promete algo que una cuenta nueva no tiene.
- Configurar el portal de clientes de Stripe para que **no** permita cambiar cantidades (o planes): ahí no corren los bloqueos; si alguien baja asientos por el portal, el webhook lo sincroniza y la organización queda por encima del tope (nadie pierde acceso, pero no se puede agregar a nadie).
- Crear en Stripe (modo prueba primero) los dos precios MXN por unidad y probar con `stripe listen`: alta con N asientos, +1 / −1 asiento con prorrateo, Pro → Básico.
