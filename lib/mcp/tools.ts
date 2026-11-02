import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPlatformDiagnostics } from "@/lib/platform/diagnostics";
import {
  extendOrgTrial,
  getBillingState,
  getOrganization,
  grantOrgCredits,
  isPlatformSecretField,
  listAudit,
  listOrganizations,
  reactivateOrg,
  reconcilePrices,
  rotateWebhook,
  runBackup,
  setOrgInternal,
  setPlatformSecret,
  suspendOrg,
  testBackup,
  testSmtp,
  testWebhook,
  type OpsResult,
  type PlatformActor,
} from "@/lib/platform/ops";
import { findUsers, getWhatsAppHealth, resetUserTwoFactor } from "@/lib/platform/support";
import type { PlatformScope, PlatformTokenContext } from "@/lib/platform/scopes";

// Herramientas del MCP. Todas llaman a lib/platform/ops.ts (la misma lógica
// que el API v1) y exigen el scope correspondiente. Las de escritura piden
// confirmación explícita; ninguna revela secretos.

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function unwrap<T>(result: OpsResult<T>): ToolResult {
  return result.ok ? ok(result.data) : err(`${result.code}: ${result.message}`);
}

function actorOf(ctx: PlatformTokenContext): PlatformActor {
  return { type: "token", email: ctx.actorEmail, tokenId: ctx.tokenId, environment: ctx.environment };
}

function missingScope(ctx: PlatformTokenContext, scope: PlatformScope): ToolResult | null {
  return ctx.scopes.includes(scope) ? null : err(`Falta el permiso ${scope} en el token`);
}

export function registerPlatformTools(server: McpServer, ctx: PlatformTokenContext): void {
  server.registerTool(
    "colibly_status",
    {
      title: "Estado de la plataforma",
      description: "Semáforo de producción: Stripe, precios, webhook, SMTP, Turnstile, IA, push, respaldos, migraciones, índices, Redis y todas las tareas programadas. Usa live=true para verificar contra Stripe.",
      inputSchema: { live: z.boolean().optional() },
    },
    async ({ live }) => {
      const denied = missingScope(ctx, "platform:read");
      if (denied) return denied;
      return ok(await getPlatformDiagnostics({ live: live === true }));
    }
  );

  server.registerTool(
    "colibly_billing_health",
    {
      title: "Salud de facturación",
      description: "Modo de la key (test/live), precios 59/89/149, lookup keys, webhook y último evento procesado. Siempre verifica contra Stripe.",
      inputSchema: {},
    },
    async () => {
      const denied = missingScope(ctx, "platform:read");
      if (denied) return denied;
      return unwrap(await getBillingState());
    }
  );

  server.registerTool(
    "colibly_list_organizations",
    {
      title: "Listar organizaciones",
      description: "Lista organizaciones con estado, plan, asientos y conteos. Filtra por texto o estado.",
      inputSchema: {
        q: z.string().optional(),
        status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "READ_ONLY", "CANCELED", "SUSPENDED"]).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => {
      const denied = missingScope(ctx, "platform:read");
      if (denied) return denied;
      return ok(await listOrganizations(args));
    }
  );

  server.registerTool(
    "colibly_get_organization",
    {
      title: "Ver organización",
      description: "Detalle de una organización: estado, plan, asientos, prueba, créditos, Stripe y canales.",
      inputSchema: { organizationId: z.string().min(1) },
    },
    async ({ organizationId }) => {
      const denied = missingScope(ctx, "platform:read");
      if (denied) return denied;
      const org = await getOrganization(organizationId);
      return org ? ok(org) : err("Organización no encontrada");
    }
  );

  server.registerTool(
    "colibly_find_user",
    {
      title: "Buscar usuario",
      description: "Busca usuarios por correo (exacto o parcial, máx. 20): organización, rol, si verificó el correo, si puede iniciar sesión, 2FA (códigos de respaldo restantes) y última conexión. Para soporte de «no puedo entrar».",
      inputSchema: { email: z.string().min(3).max(200) },
    },
    async ({ email }) => {
      const denied = missingScope(ctx, "platform:read");
      if (denied) return denied;
      return unwrap(await findUsers(email));
    }
  );

  server.registerTool(
    "colibly_reset_two_factor",
    {
      title: "Quitar verificación en dos pasos",
      description: "Quita la 2FA a un usuario que perdió su teléfono y sus códigos de respaldo, y cierra todas sus sesiones. Antes confirma la identidad de la persona por otro medio. Exige el userId (de colibly_find_user), un motivo y escribir su correo exacto en confirm. No aplica a operadores de la plataforma.",
      inputSchema: {
        userId: z.string().min(1),
        reason: z.string().min(5).max(500),
        confirm: z.string().min(1),
      },
    },
    async ({ userId, reason, confirm }) => {
      const denied = missingScope(ctx, "user:write");
      if (denied) return denied;
      const found = await findUsers(confirm);
      const target = found.ok ? found.data.items.find((user) => user.id === userId) : undefined;
      if (!target || target.email !== confirm.trim().toLowerCase()) {
        return err("Escribe en confirm el correo exacto del usuario que corresponde a ese userId");
      }
      return unwrap(await resetUserTwoFactor({ userId, reason, actor: actorOf(ctx) }));
    }
  );

  server.registerTool(
    "colibly_whatsapp_health",
    {
      title: "Salud de los números de WhatsApp",
      description: "Consulta a Meta cada número: nombre para mostrar (aprobado o en revisión), si puede enviar (AVAILABLE/LIMITED/BLOCKED), calidad, límite de mensajes, avisos de Meta y envíos fallidos en 24 h. Veredicto ok/limited/blocked/unknown. Filtra por organización o cuenta; sin filtro, las 25 cuentas con actividad más reciente (usa page para más).",
      inputSchema: {
        organizationId: z.string().min(1).optional(),
        accountId: z.string().min(1).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => {
      const denied = missingScope(ctx, "platform:read");
      if (denied) return denied;
      return unwrap(await getWhatsAppHealth(args));
    }
  );

  server.registerTool(
    "colibly_extend_trial",
    {
      title: "Extender prueba",
      description: "Extiende (o vuelve a dar) la prueba de una organización. Requiere confirm=true.",
      inputSchema: {
        organizationId: z.string().min(1),
        days: z.number().int().min(1).max(90),
        confirm: z.boolean(),
      },
    },
    async ({ organizationId, days, confirm }) => {
      const denied = missingScope(ctx, "org:write");
      if (denied) return denied;
      if (!confirm) return err("Confirma la acción con confirm=true");
      return unwrap(await extendOrgTrial(organizationId, days, actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_grant_credits",
    {
      title: "Dar créditos de IA",
      description: "Suma créditos de IA al periodo actual de una organización. Requiere confirm=true.",
      inputSchema: {
        organizationId: z.string().min(1),
        credits: z.number().int().min(1).max(100000),
        confirm: z.boolean(),
      },
    },
    async ({ organizationId, credits, confirm }) => {
      const denied = missingScope(ctx, "org:write");
      if (denied) return denied;
      if (!confirm) return err("Confirma la acción con confirm=true");
      return unwrap(await grantOrgCredits(organizationId, credits, actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_suspend_organization",
    {
      title: "Suspender organización",
      description: "Suspende una organización (bloquea escrituras y cierra sesiones). Escribe el nombre exacto en confirm.",
      inputSchema: {
        organizationId: z.string().min(1),
        confirm: z.string().min(1),
      },
    },
    async ({ organizationId, confirm }) => {
      const denied = missingScope(ctx, "org:write");
      if (denied) return denied;
      const org = await getOrganization(organizationId);
      if (!org) return err("Organización no encontrada");
      if (confirm !== org.name) return err(`Escribe el nombre exacto de la organización: "${org.name}"`);
      return unwrap(await suspendOrg(organizationId, actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_reactivate_organization",
    {
      title: "Reactivar organización",
      description: "Reactiva una organización suspendida; si tiene suscripción, re-sincroniza con Stripe. Requiere confirm=true.",
      inputSchema: {
        organizationId: z.string().min(1),
        confirm: z.boolean(),
      },
    },
    async ({ organizationId, confirm }) => {
      const denied = missingScope(ctx, "org:write");
      if (denied) return denied;
      if (!confirm) return err("Confirma la acción con confirm=true");
      return unwrap(await reactivateOrg(organizationId, actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_set_internal_organization",
    {
      title: "Marcar organización interna",
      description: "Marca o desmarca una organización como interna (sin cobro ni límites de plan). Escribe el nombre exacto en confirm. No permite marcarla interna si tiene una suscripción de Stripe viva.",
      inputSchema: {
        organizationId: z.string().min(1),
        internal: z.boolean(),
        confirm: z.string().min(1),
      },
    },
    async ({ organizationId, internal, confirm }) => {
      const denied = missingScope(ctx, "org:write");
      if (denied) return denied;
      const org = await getOrganization(organizationId);
      if (!org) return err("Organización no encontrada");
      if (confirm !== org.name) return err(`Escribe el nombre exacto de la organización: "${org.name}"`);
      return unwrap(await setOrgInternal(organizationId, internal, actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_reconcile_prices",
    {
      title: "Reconciliar precios de Stripe",
      description: "Compara el catálogo de Stripe con la oferta 59/89/149 y propone cambios. Por defecto solo simula; para aplicar exige confirm=\"APLICAR\".",
      inputSchema: {
        dryRun: z.boolean().optional(),
        confirm: z.string().optional(),
      },
    },
    async ({ dryRun, confirm }) => {
      const denied = missingScope(ctx, "billing:write");
      if (denied) return denied;
      const simulate = dryRun !== false;
      if (!simulate && confirm !== "APLICAR") return err('Para aplicar escribe confirm: "APLICAR"');
      return unwrap(await reconcilePrices({ dryRun: simulate, actor: actorOf(ctx) }));
    }
  );

  server.registerTool(
    "colibly_rotate_webhook",
    {
      title: "Rotar webhook de Stripe",
      description: "Crea un endpoint nuevo, guarda su signing secret y borra el viejo. Exige confirm=\"ROTAR\".",
      inputSchema: { confirm: z.string() },
    },
    async ({ confirm }) => {
      const denied = missingScope(ctx, "billing:write");
      if (denied) return denied;
      if (confirm !== "ROTAR") return err('Escribe confirm: "ROTAR"');
      return unwrap(await rotateWebhook(actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_test_webhook",
    {
      title: "Probar webhook de Stripe",
      description: "Firma un evento sintético con el secret guardado y lo envía al endpoint público. Verifica que responda 200.",
      inputSchema: {},
    },
    async () => {
      const denied = missingScope(ctx, "billing:write");
      if (denied) return denied;
      return unwrap(await testWebhook());
    }
  );

  server.registerTool(
    "colibly_run_backup",
    {
      title: "Correr respaldo",
      description: "Encola un respaldo manual de la base (y medios si está configurado). Requiere confirm=true.",
      inputSchema: { confirm: z.boolean() },
    },
    async ({ confirm }) => {
      const denied = missingScope(ctx, "backup:write");
      if (denied) return denied;
      if (!confirm) return err("Confirma la acción con confirm=true");
      return unwrap(await runBackup(actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_test_backup",
    {
      title: "Probar bucket de respaldos",
      description: "Prueba lectura/escritura/borrado contra el bucket configurado, sin correr un respaldo completo.",
      inputSchema: {},
    },
    async () => {
      const denied = missingScope(ctx, "backup:write");
      if (denied) return denied;
      return unwrap(await testBackup());
    }
  );

  server.registerTool(
    "colibly_test_smtp",
    {
      title: "Probar SMTP",
      description: "Envía un correo de prueba a la dirección indicada usando el SMTP configurado.",
      inputSchema: { to: z.string().email() },
    },
    async ({ to }) => {
      const denied = missingScope(ctx, "mail:test");
      if (denied) return denied;
      return unwrap(await testSmtp(to, actorOf(ctx)));
    }
  );

  server.registerTool(
    "colibly_list_audit",
    {
      title: "Ver auditoría",
      description: "Últimos movimientos de operadores y tokens (sin secretos).",
      inputSchema: {
        action: z.string().optional(),
        targetId: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => {
      const denied = missingScope(ctx, "platform:read");
      if (denied) return denied;
      return ok(await listAudit(args));
    }
  );

  // La escritura de secretos por MCP está apagada por defecto: el valor
  // entraría al contexto del modelo. Se habilita con una variable explícita.
  if (process.env.COLIBLY_MCP_ALLOW_SECRET_WRITE === "1") {
    server.registerTool(
      "colibly_set_secret",
      {
        title: "Escribir secreto",
        description: "Escribe un secreto de PlatformSettings (nunca lo devuelve). Requiere confirm con el nombre del campo. ADVERTENCIA: el valor pasa por el modelo; para rotar claves usa curl o la UI.",
        inputSchema: {
          field: z.string().min(1),
          value: z.string().min(1).max(500),
          confirm: z.string().min(1),
        },
      },
      async ({ field, value, confirm }) => {
        const denied = missingScope(ctx, "secret:write");
        if (denied) return denied;
        if (!isPlatformSecretField(field)) return err("Campo de secreto no válido");
        if (confirm !== field) return err(`Escribe confirm: "${field}"`);
        return unwrap(await setPlatformSecret({ field, value, actor: actorOf(ctx) }));
      }
    );
  }
}
