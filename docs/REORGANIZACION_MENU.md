# Plan de implementación — Reorganización del menú lateral

**Fecha:** 2026-07-25 (revisión 2026-07-25 tras auditoría de Claude)
**Estado:** Pendiente de revisión
**Archivos a modificar:** 2 (`dashboard-shell.tsx`, `CLAUDE.md`)
**Archivos existentes sin cambios:** proxy.ts, todas las page.tsx, app-shell.tsx, layout.tsx, API routes

---

## Cambios de esta revisión

Respecto a la versión anterior de este plan:

1. **Se agrega la actualización de `CLAUDE.md`** — la sección "Navigation" documenta los 5 grupos actuales por nombre; si el menú cambia sin tocar esa sección, la doc queda desincronizada del código (mismo problema que ya se corrigió antes en `AGENTS.md`).
2. **Cuentas WhatsApp y Cuentas Telegram se tratan igual** — ambas viven juntas dentro de "Mensajería" en vez de que Telegram tenga su propio grupo de nivel superior solo para su pantalla de cuentas. La versión anterior le daba a Telegram un grupo dedicado que WhatsApp no tenía (su entrada de cuentas iba dentro de Mensajería) — eso rompía el principio de "canales igual de importantes" antes de que alguien lo pidiera explícitamente.
3. **"Difusión WhatsApp" se mantiene como grupo propio, no se fusiona con Automatización** — Plantillas y Campañas son features de la API de Meta sin equivalente en Telegram (ver el trabajo de paridad en curso, `docs/PARIDAD_CANALES.md`); fusionarlas dentro de un "Automatización" genérico borraría la única señal visual de que esas dos pantallas no aplican a Telegram. Bots IA y Calificadores sí quedan en "Automatización" — son funciones que ya son (o están en camino de ser) multi-canal.

---

## Resumen

Reorganizar el sidebar de 6 grupos actuales a 5, alineando con el patrón de la industria (Chatwoot, Kommo, ManyChat): los canales no son ítems de menú de primer nivel, el menú refleja lo que el usuario **hace**, no **por dónde** lo hace — aplicado por igual a WhatsApp y Telegram, no solo a uno de los dos.

**Cambio clave:** mover items entre grupos + refrescar una sección de doc. Cero cambios de URLs, cero cambios de middleware, cero cambios de páginas.

---

## Antes → Después

```
ANTES                                    DESPUÉS
======                                   ======
Principal                                Inicio
  Panel                                    Panel
  Bandeja de Chats  ───────────────┐       Estadísticas
  Contactos  ──────────────────────┤
  Estadísticas                      │   Mensajería
  Pipeline  ────────────────────────┤     Bandeja de Chats  ← ──┐
                                    │     Contactos          ← ──┤
Automatización                      │     Pipeline           ← ──┤
  Bots IA  ───────────────┐        │     Cuentas WhatsApp   ← ──┤
  Calificadores            │        │     Cuentas Telegram   ← ──┘
                           │        │
Difusión WhatsApp          │        │ Automatización
  Plantillas  ─────────────┤        │   Bots IA               ← ─┐
  Campañas  ───────────────┤        │   Calificadores         ← ─┘
                           │        │
Canales                    │        │ Difusión WhatsApp
  Cuentas WhatsApp  ───────┘        │   Plantillas              (sin cambio de grupo)
  Cuentas Telegram  ────────────────┘   Campañas                (sin cambio de grupo)
                                    │
Ajustes                             │ Ajustes
  Usuarios                             Usuarios
  Configuración                        Configuración
```

Diferencia clave contra la propuesta original: **Cuentas Telegram ya no tiene su propio grupo** — se une a Cuentas WhatsApp dentro de Mensajería, y "Difusión WhatsApp" **no** se fusiona con Automatización.

---

## Archivos a modificar

### 1. `app/(dashboard)/dashboard-shell.tsx`

Cambio puntual: redefinir el array `NAV` para roles admin/user. El NAV de ejecutivo **no cambia** (ya es correcto con el nuevo esquema: Mensajería + Ajustes).

#### Bloque nuevo para admin/user (reemplaza el bloque `else` actual):

```tsx
[
  {
    title: "Inicio",
    items: [
      { href: "/dashboard",    label: "Panel",        icon: LayoutDashboard, exact: true },
      { href: "/estadisticas", label: "Estadísticas", icon: BarChart3,        exact: true },
    ],
  },
  {
    title: "Mensajería",
    items: [
      { href: "/whatsapp/chat",    label: "Chats",             icon: MessageSquare },
      ...(isAdmin ? [{ href: "/whatsapp/contactos" as const, label: "Contactos", icon: Contact as React.ElementType }] : []),
      { href: "/ventas",           label: "Pipeline",          icon: KanbanSquare, exact: true },
      { href: "/whatsapp/cuentas", label: "Cuentas WhatsApp",  icon: Phone },
      { href: "/telegram/cuentas", label: "Cuentas Telegram",  icon: Send },
    ],
  },
  {
    title: "Automatización",
    items: [
      ...(isAdmin ? [{ href: "/whatsapp/bots" as const, label: "Bots IA", icon: Bot as React.ElementType }] : []),
      { href: "/whatsapp/calificadores", label: "Calificadores de Leads", icon: Target },
    ],
  },
  // El alcance va en el título del grupo, a propósito: plantillas y campañas
  // son features de la API de Meta sin equivalente en Telegram. No fusionar
  // con "Automatización" — perdería la única señal visual de que estas dos
  // pantallas no aplican al segundo canal (ver docs/PARIDAD_CANALES.md).
  {
    title: "Difusión WhatsApp",
    items: [
      { href: "/whatsapp/plantillas", label: "Plantillas",       icon: FileText },
      { href: "/whatsapp/campanas",   label: "Campañas Masivas", icon: Megaphone },
    ],
  },
  {
    title: "Ajustes",
    items: [
      ...(isAdmin
        ? [{ href: "/usuarios" as const, label: "Usuarios", icon: Users as React.ElementType, exact: true }]
        : []),
      { href: "/configuracion", label: "Configuración", icon: Settings, exact: true },
    ],
  },
]
```

#### Resumen de cambios línea por línea:

| Cambio | Detalle |
|---|---|
| Grupo "Principal" → "Inicio" | Solo Panel + Estadísticas. Pierde Chats, Contactos, Pipeline |
| Nuevo grupo "Mensajería" | Chats + Contactos + Pipeline + Cuentas WhatsApp + **Cuentas Telegram** (unifica 5 ítems de 3 grupos distintos — ambas cuentas de canal quedan al mismo nivel) |
| Grupo "Automatización" | Sin cambio de contenido (Bots IA + Calificadores) |
| Grupo "Difusión WhatsApp" | **Sin cambio** — sigue siendo su propio grupo, con su nombre intacto |
| Grupo "Canales" | **Eliminado** (sus dos ítems se reparten dentro de Mensajería) |
| Grupo "Ajustes" | Sin cambios (Usuarios + Configuración) |

### 2. `CLAUDE.md`

Sección "## Navigation": actualizar el texto que describe los 5 grupos actuales ("Principal · Automatización · Difusión WhatsApp · Canales · Ajustes") por la nueva composición ("Inicio · Mensajería · Automatización · Difusión WhatsApp · Ajustes"), y ajustar la frase sobre por qué "Difusión WhatsApp" lleva el canal en el nombre para que siga siendo precisa (ya no es "el único grupo con un canal en el nombre" si en algún momento se agregan más grupos de alcance similar, pero por ahora sigue siendo la única excepción al principio "canal no es ítem de menú").

---

## Archivos que **NO** se modifican

| Archivo | Razón |
|---|---|
| `proxy.ts` | Las URLs no cambian. Los mismos roles tienen acceso a las mismas rutas. |
| `app/(dashboard)/page.tsx` | Redirects sin cambios (ejecutivo → /whatsapp/chat, otros → /dashboard). |
| `app/(dashboard)/whatsapp/page.tsx` | Redirect sin cambios (/whatsapp/cuentas). |
| `app/(dashboard)/layout.tsx` | Sin cambios. |
| `app/components/ui/app-shell.tsx` | El `AppShell` es genérico, recibe `nav` como prop. Grupos con `items.length === 0` se ocultan automáticamente. |
| Todas las `page.tsx` | Solo reorganizamos el menú, no las páginas. |
| Todas las API routes | Sin cambios. |
| `lib/shared-accounts.ts` | Sin cambios. |
| `AGENTS.md` | No documenta la composición de grupos del menú (ese detalle vive solo en `CLAUDE.md`) — nada que actualizar ahí. |

---

## Verificación post-implementación

### Check manual por rol:

**Admin** (13 items → 13 items, reordenados en 5 grupos):
- [ ] Inicio: Panel, Estadísticas
- [ ] Mensajería: Chats, Contactos, Pipeline, Cuentas WhatsApp, Cuentas Telegram
- [ ] Automatización: Bots IA, Calificadores
- [ ] Difusión WhatsApp: Plantillas, Campañas
- [ ] Ajustes: Usuarios, Configuración

**User** (10 items, mismos que admin menos los gated por `isAdmin`):
- [ ] Inicio: Panel, Estadísticas
- [ ] Mensajería: Chats, Pipeline, Cuentas WhatsApp, Cuentas Telegram (sin Contactos)
- [ ] Automatización: Calificadores (sin Bots IA)
- [ ] Difusión WhatsApp: Plantillas, Campañas
- [ ] Ajustes: Configuración (sin Usuarios)

**Ejecutivo** (sin cambios):
- [ ] Mensajería: Chats, Contactos
- [ ] Ajustes: Configuración

### Check de regresión:
- [ ] `docker compose up --build` — compila sin errores
- [ ] `npm run build` (con `NODE_ENV=production`) — build limpio
- [ ] `npx tsc --noEmit` — type check limpio
- [ ] Navegar como admin y verificar los 5 grupos en el sidebar
- [ ] Navegar como user y verificar items correctos
- [ ] Navegar como ejecutivo y verificar sin cambios
- [ ] Click en cada item del menú — navega a la URL correcta
- [ ] Active state funciona (pill resaltado en la ruta correcta)
- [ ] Colapsar sidebar (toggle) — funciona
- [ ] `CLAUDE.md` describe los grupos nuevos, no los viejos

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Ítem de menú activo incorrecto (dos rutas matchean mismo prefijo) | `exact: true` ya está en Panel, Estadísticas, Pipeline, Usuarios, Configuración. Los demás usan prefix match, que es correcto para sus sub-rutas. |
| Grupo vacío (cuando `isAdmin` es false para user) | `AppShell` ya maneja grupos con `items.length === 0` ocultándolos automáticamente. No se renderiza label ni `ul`. |
| Romper caché de Turbopack | Es un cambio solo de componente cliente — no debería requerir limpieza. Si hay 404s: `docker compose exec -u root app sh -c "rm -rf .next" && docker compose restart app` + hard refresh con "Disable cache" en DevTools. |
| Error de tipo en spreads condicionales | El patrón `...(isAdmin ? [{...} as const] : [])` ya existe en el código actual. No se introduce nuevo patrón. |
| Doc desincronizada | Cubierto por el paso 2 (actualizar `CLAUDE.md` en el mismo cambio, no después). |

---

## Orden de ejecución

1. Editar `app/(dashboard)/dashboard-shell.tsx`: reemplazar el bloque `:` (no-ejecutivo) con la nueva estructura de 5 grupos.
2. Editar `CLAUDE.md` (sección Navigation) en el mismo cambio.
3. `docker compose exec app npx tsc --noEmit` — verificar tipos.
4. `docker compose restart app` — recargar con el nuevo código.
5. Hard refresh en el navegador (DevTools → Disable cache).
6. Verificar visualmente los 3 roles.
7. Si todo OK → commit (dashboard-shell.tsx + CLAUDE.md en el mismo commit).

---

## Relación con la paridad de canales

Este plan es independiente de la paridad funcional entre WhatsApp y Telegram (ver `docs/PARIDAD_CANALES.md`) — es solo un reordenamiento visual. Pero el nombre "Difusión WhatsApp" que este plan preserva deja de ser preciso el día que Plantillas/Campañas dejen de ser exclusivas de Meta (si eso llega a pasar); por ahora, mientras esa paridad no incluya campañas/plantillas, el nombre sigue siendo correcto.

---

## Justificación (benchmarking)

Chatwoot, Kommo y ManyChat siguen el principio: **los canales de mensajería no son ítems del menú principal**. WhatsApp, Telegram, Instagram se conectan como "inboxes" dentro del módulo de Chats. El menú refleja lo que el usuario **hace** (chatear, analizar, automatizar, configurar), no **por dónde** lo hace — y ese principio se aplica por igual a los dos canales que ya existen aquí, no solo a uno.

SundayCRM era la excepción: exponía "Cuentas WhatsApp" y "Cuentas Telegram" como ítems de menú de primer nivel, y además en grupos desparejos entre sí (WhatsApp adentro de un grupo compartido, Telegram con su propio grupo dedicado). Esta reorganización corrige ambas desviaciones: saca los canales del nivel superior del menú, y los deja exactamente al mismo nivel entre sí.
