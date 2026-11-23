# Rediseño de Colibly con Astryx

Rama de trabajo para reemplazar la capa de UI de Colibly (`app/components/ui/`,
89 componentes propios) por el design system **Astryx**
(`@astryxdesign/core` 0.7.17, React 19 + StyleX, convive con Tailwind).
La lógica (`lib/`, `prisma/`, `app/api/`) no se toca.

Esta carpeta es **material de referencia**: está fuera del `tsconfig`, de ESLint
y de la imagen de Docker, así que no afecta el build de la app. Se borra cuando
el rediseño esté integrado.

## Contenido

| Carpeta | Qué es |
|---|---|
| [`DECISION.md`](DECISION.md) | Qué se decidió, desviaciones de la dirección congelada y trampas encontradas |
| [`PENDIENTES.md`](PENDIENTES.md) | Lo que falta de la migración, con casillas para dar seguimiento |
| `capturas/` | El prototipo en celular (390 px) y escritorio (1280 px), claro y oscuro |
| `tema/` | Tema `colibly` del editor de temas de Astryx (fuente + build) |
| `prototipo/` | Bandeja hecha con Astryx y datos ficticios (Next 16, de `~/Proyectos/crm`) |

### `prototipo/`

- `lib/inbox/`: lógica pura. `waiting.ts`, `sort.ts` y `service-window.ts` son
  **copias sin cambios** de `lib/chats/waiting-shared.ts`, `lib/chats/sort.ts` y
  `lib/whatsapp/service-window.ts`; al integrar, se usan los originales.
  `types.ts` tiene la misma forma que `ChatItem`. `row-signal.ts` es nuevo
  (qué señal muestra la fila del chat en el celular). `mock.ts` se elimina.
- `bandeja/`: `InboxView` (orquestador, pushState/popstate), `ChatListPane`,
  `ConversationPane`, `format.ts` (fechas con zona fija).
- `components/ColorMode.tsx` + `providers.tsx`: tema claro/oscuro controlado
  por la app con la clave `theme`, como hoy.

## Cómo continuar (siguiente paso)

1. Instalar en Colibly, con versiones fijas:
   `npm i @astryxdesign/core@0.7.17 @astryxdesign/theme-neutral@0.7.17 @stylexjs/stylex@^0.19.0 @fontsource/barlow`
   y `npm i -D @astryxdesign/cli@0.7.17`.
2. Copiar `tema/` a `themes/colibly/` y ejecutar
   `npx astryx experimental theme compile themes/colibly/colibly.theme.ts`,
   después `npx astryx theme add colibly` (genera `astryx-themes.ts` y la copia
   para la app). El tema extiende `theme-neutral`: debe seguir instalado.
3. Importar `@astryxdesign/core/reset.css` y `astryx.css` y envolver la app en
   `<Theme theme={themes.colibly} mode={mode}>`; conectar el `mode` al
   `theme-provider.tsx` actual (no duplicarlo).
4. Portar la bandeja: `prototipo/bandeja/` sobre `chat-workspace.tsx`,
   sustituyendo `buildMockInbox` por `/api/inbox/sync` + `usePoll()` y el envío
   local por `POST /api/whatsapp/chats/[chatId]/send`.
5. Verificar con `podman compose exec app npx tsc --noEmit`, lint, tests y el
   build de producción, y probar en el celular.
