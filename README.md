# Colibly

> Dominio: [colibly.com](https://colibly.com). Antes SunflowCRM y SundayCRM; hoy todo se llama Colibly (repo, carpeta, contenedores, base de datos). Paleta "Menta y grafito" (verde #0F766E; antes "Colibrí", violeta); el logo actual es una "C" provisional mientras se define el definitivo (ver [`docs/PLAN_LANZAMIENTO.md`](docs/PLAN_LANZAMIENTO.md)). El proyecto sigue en desarrollo.

CRM conversacional multi-tenant y de pago (SaaS) para negocios que venden por mensaje: una bandeja para WhatsApp, Instagram, Messenger, Telegram y el chat de la web, con bots de IA, automatizaciones, campañas y calificación de leads.

## Funcionalidad

- **Bandeja multicanal**: WhatsApp (API oficial de Meta, Cloud API), Messenger, Instagram, Telegram y un widget de chat para la web del cliente. Asignación de agentes (manual, automática o por reglas), etiquetas, notas, respuestas rápidas, adjuntos con proxy seguro de medios.
- **Bots de IA**: respuestas multimodales con RAG sobre una base de conocimiento propia (pgvector), agendado de citas desde la conversación y humanización de respuestas. La IA la provee la plataforma: cada plan incluye créditos mensuales.
- **Automatizaciones**: un solo motor para chatbots de botones, reglas evento → acción y seguimientos, en todos los canales, con versiones publicadas y modo de prueba.
- **Campañas y plantillas** de WhatsApp (Meta), con segmentación por etiqueta, variables por destinatario y métricas.
- **CRM**: contactos con campos personalizados, pipeline Kanban, citas con recordatorios, calificadores de leads por IA, recuperación de leads en visto, feedback a Meta Ads (Conversions API).
- **Integraciones**: API pública v1 con API keys, webhooks salientes firmados, Google Sheets.
- **SaaS**: organizaciones aisladas entre sí, planes Esencial, Negocio y Pro con límites, cobro con Stripe, prueba de 14 días, exportar y eliminar datos, purga automática de cuentas canceladas o sin pago, panel del operador (`/plataforma`).
- **Roles**: `admin`, `user` y `ejecutivo`, aplicados en la navegación, en `proxy.ts` y en cada endpoint.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · NextAuth v5 (Credentials + JWT) · Prisma 5 sobre PostgreSQL + pgvector · Redis + BullMQ · OpenCode Go (`openai` SDK) y Google Gemini · Stripe · Vitest.

## Desarrollo

Todo corre en contenedores: no se instalan dependencias ni bases de datos en el host. Los archivos de compose funcionan con `docker compose` y con `podman compose`; en el servidor compartido de desarrollo se usa **Podman** (el Docker de ese servidor es el de producción).

```bash
cp .env.example .env                      # completa las variables (comentadas en el archivo)
podman compose up --build                 # app + postgres + redis + mailpit, hot reload en http://localhost:15100
```

Comandos habituales:

```bash
podman compose exec app npx tsc --noEmit                        # type check
podman compose exec app npm run lint                            # eslint
podman compose exec app npm test                                # tests (vitest, lógica pura en lib/**/__tests__)
podman compose exec app sh scripts/new-migration.sh <nombre>    # tras cambiar schema.prisma: crea y aplica la migración
podman compose restart app                                      # tras una migración o un cambio en código de workers
```

- **Nunca `prisma db push` ni `prisma migrate dev`**: el primero puede borrar columnas con datos y el segundo ofrece reiniciar la base. Los cambios de esquema van siempre con `scripts/new-migration.sh`.
- Los correos de desarrollo (verificación, invitaciones, recuperar contraseña) no salen de la máquina: llegan a Mailpit, en http://localhost:18025.
- Abre la app como `localhost` o `ludaisca` (por Tailscale), no como `127.0.0.1`: el servidor de desarrollo de Next bloquea otros orígenes y la página no se hidrata.
- Build de producción: `podman build --target builder -t localhost/colibly-buildcheck:tmp . && podman rmi localhost/colibly-buildcheck:tmp && podman image prune -f` (`npm run build` dentro del contenedor de desarrollo falla por `NODE_ENV=development`).

El CI (`.github/workflows/ci.yml`) corre tsc, lint, tests y el build de producción en cada PR y push a `main`.

### Variables de entorno

La lista de infraestructura está en [`.env.example`](.env.example). Las imprescindibles son `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD` (producción) y `APP_URL`. SMTP, las claves de IA (OpenCode Go y Google), Stripe, Turnstile y la medición del sitio se configuran desde `/plataforma` → **Configuración** y se guardan cifradas en `PlatformSettings`. Para habilitar `/plataforma`, configura `PLATFORM_ADMIN_EMAILS` en el entorno. Google Sheets usa las credenciales OAuth de entorno. El RAG necesita además una clave de Google para generar embeddings, incluso si las respuestas del bot usan OpenCode.

Toda variable nueva de infraestructura debe agregarse también a la lista `app.environment` de `docker-compose.yml`, o no llega a producción. Las claves de negocio se agregan a `PlatformSettings`, no a Compose.

## Arquitectura

- `app/`: rutas del App Router. `(marketing)` (landing y páginas legales), `(auth)` (registro, login, verificación, invitaciones), `(dashboard)` (la app) y `api/` (endpoints internos, webhooks de los canales y la API pública `v1`).
- `lib/`: lógica de dominio por área (`whatsapp/`, `telegram/`, `meta-messaging/`, `webchat/`, `automations/`, `billing/`, `ai/`, `workers/`, `api/`, `webhooks/`, `org-data/`…) y utilidades transversales (`tenancy.ts`, `shared-accounts.ts`, `crypto.ts`, `rate-limit.ts`).
- `prisma/`: esquema, migraciones y SQL del índice vectorial.
- `proxy.ts`: el middleware de Next 16 (protección de rutas por rol y bloqueo de escrituras en cuentas de solo lectura).

Las convenciones, decisiones de arquitectura y trampas conocidas están en [`AGENTS.md`](AGENTS.md) (detalle) y [`CLAUDE.md`](CLAUDE.md) (reglas esenciales). Planes, auditorías y estado del lanzamiento: índice en [`docs/README.md`](docs/README.md).

## Despliegue

Pensado para Coolify u otra plataforma compatible con `docker-compose.yml`. El servicio de la app no publica puerto fijo (`expose: 5000`): el proxy de la plataforma enruta por dominio. Al arrancar, `scripts/startup.sh` aplica las migraciones (`migrate deploy`) antes de levantar el servidor.
