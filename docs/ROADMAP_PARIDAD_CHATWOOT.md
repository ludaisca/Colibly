# Roadmap de paridad con Chatwoot

> Fecha del análisis: 19 de octubre de 2026 · Rama: `feat/lanzamiento-pulido`
>
> **Advertencia:** la columna de Chatwoot se armó con su lista pública de funciones (chatwoot.com/features, /pricing y developers.chatwoot.com) **de memoria y sin volver a verificarla en su sitio** durante este análisis. Antes de tomar decisiones comerciales o publicar comparativas, hay que confirmarla contra el sitio actual de Chatwoot.

Fuente Colibly: este repositorio, rama `feat/lanzamiento-pulido` (revisión en solo lectura). Precios de referencia de Chatwoot: Hacker gratis · Startups $19 · Business $39 · Enterprise $99 USD por agente al mes (sin verificar).

Leyenda: Sí / Parcial / No. La evidencia viene de nombres de rutas, modelos y archivos más grep. No probé cada función en ejecución, así que las marcas "No" que dependen de grep conviene revisarlas a mano antes de decidir.

## 1. Canales
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| WhatsApp Cloud API | Sí | Sí | `app/api/whatsapp/webhook`, `embedded-signup/*`, `enum WAConnectionType` |
| WhatsApp Coexistence (app + API) | No (solo Cloud/360dialog/Twilio) | Sí | `lib/whatsapp/coexistence/ingest.ts`, `docs/PLAN_COEXISTENCIA.md` |
| Messenger | Sí | Sí | `app/api/messenger/*`, `app/api/meta/webhook/messaging` |
| Instagram DM | Sí | Sí | `app/api/instagram/*` |
| Comentarios de FB → conversación | No | Parcial (solo FB Page, no IG) | `ChannelMessage.isFromComment`, private_replies (PLAN_ROADMAP P3-c) |
| Telegram | Sí | Sí | `app/api/telegram/webhook/[accountId]` |
| Web chat (widget) | Sí (multimedia, pre-chat, idiomas) | Parcial (solo texto, polling) | `app/api/webchat/[accountId]/widget.js`, `lib/webchat/session-token.ts` |
| Email | Sí | No | solo correo transaccional en `lib/email` |
| SMS (Twilio/Bandwidth) | Sí | No | sin referencias a twilio/sms |
| Line | Sí | No | — |
| Canal API (canal personalizado) | Sí | Parcial | `/api/v1/messages` envía por canales existentes; no hay canal "custom" |
| Voz / llamadas | Sí (Captain Voice / Twilio voice, nuevo) | No | — |
| TikTok / Google Business | Parcial / No | No | — |

## 2. Conversaciones
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| Bandeja compartida, asignación manual | Sí | Sí | `chats/[chatId]/assign`, `assignees`, `lib/chat-assignees.ts` |
| Auto-asignación (balanceo + tope) | Sí | Sí | `autoAssignEnabled`, `maxOpenChats`, `autoAssignChat()` |
| Reglas de enrutamiento por atributo | Parcial (vía automatización) | Sí | `WAAccountRoutingRule` (TAG/LEAD_ORIGIN/SCORE_LABEL) |
| Equipos (teams) | Sí | No | no hay modelo Team |
| Etiquetas en conversación | Sí | Sí | `ChatTag`, `chats/[chatId]/tags` |
| Estados abierto/pendiente/resuelto | Sí | Sí | `enum ChatStatus`, `chats/[chatId]/status` |
| Posponer (snooze) | Sí | No | sin referencias |
| Prioridad | Sí | No | — |
| Notas privadas dentro del hilo | Sí | Parcial | `WANote` es nota de contacto, no del hilo |
| @menciones a agentes | Sí | No | — |
| Respuestas rápidas (canned) | Sí | Sí | `CannedResponse`, `whatsapp/canned-responses` |
| Plantillas de WhatsApp en el chat | Sí | Sí (+ creación y analítica) | `send-template`, `templates/create`, `templates/[id]/analytics` |
| Macros (varias acciones en un clic) | Sí | No | — |
| Acciones masivas | Sí | No (por verificar en UI) | — |
| Búsqueda | Sí (mensajes, contactos, conversaciones) | Parcial | `?search` en `chats/route.ts`, `contacts/route.ts`; no busca en mensajes |
| Filtros avanzados / vistas guardadas | Sí | Parcial | filtros básicos; no hay vistas guardadas |
| Ventana de 24 h de WhatsApp | Parcial | Sí | `chats/[chatId]/window` |
| Reacciones, stickers, multimedia | Sí | Sí | `messages/[id]/reaction`, `WASticker`, `*/media` |
| Audio y transcripción | Sí (Captain) | Parcial | se manejan medios; no confirmé transcripción |
| Escribiendo / leído | Sí | Parcial | estados de entrega de WA; "escribiendo" simulado en el bot (`lib/whatsapp/humanize.ts`) |
| CSAT | Sí | No | — |
| SLA | Sí (Business+) | No | — |
| Horario de atención / fuera de oficina | Sí | No (por verificar) | grep de "horario" solo dio textos de UI |
| Traducción de mensajes | Sí | No | — |

## 3. Contactos / CRM
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| Atributos personalizados | Sí | Sí | `ContactCustomFieldDefinition/Value` |
| Etiquetas y límites de contactos por plan | Sí / No | Sí | `ContactTag`, `api/billing/contacts`, `billing/limit` |
| Notas de contacto | Sí | Sí | `contacts/[id]/notes` |
| Segmentos | Sí | Parcial | segmentación por etiqueta en campañas |
| Fusionar contactos | Sí | No | — |
| Importar/exportar CSV | Sí | Parcial | importación CSV en campañas, `lib/csv.ts`, Google Sheets, `organizacion/exportar` |
| Empresas | Sí (nuevo) | No | — |
| Pipeline / estatus de lead | No | Sí | `enum LeadStatus`, `/ventas`, `lead-card.tsx` |
| Calificación de leads con IA | No | Sí | `WALeadScorerBot`, `lead-scores` |
| Citas / agenda | No | Sí | `WAAppointment`, `/whatsapp/citas` |
| Meta Ads Lead Ads + CAPI | No | Sí | `meta/webhook/leadgen`, `MetaConversionEvent`, `/meta-ads` |

## 4. Automatización e IA
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| Reglas de automatización | Sí (evento → condición → acción) | Sí (constructor visual con versiones, simulador y ejecuciones) | `lib/automations/*`, `AutomationVersion`, `simulate` |
| Secuencias / goteo | No | Sí | `WASequence*`, `lib/sequences.ts` |
| Recuperación de leads | No | Sí | `lib/workers/lead-recovery-worker.ts` |
| Bot de IA con auto-respuesta | Sí (Captain) | Sí | `WABot`, `bot-worker.ts` |
| Base de conocimiento para el bot (RAG) | Sí (docs/FAQ) | Sí | `bots/[id]/knowledge/upload` |
| Copiloto (sugerir respuesta) | Sí | Sí | `chats/[chatId]/suggest-reply` |
| Resumen / reescribir / tono | Sí | No | — |
| Créditos de IA y presupuesto | Sí (Captain credits) | Sí | `WABotUsage`, `AutomationAiUsage`, `BUDGET_EXCEEDED` |
| Agenda citas por IA | No | Sí | `lib/ai/appointment-marker.ts` |
| Dialogflow / bot externo | Sí | No (vía webhooks/API) | — |

## 5. Campañas
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| Difusión con plantillas de WhatsApp | Sí (nuevo, básico) | Sí | `WACampaign*`, `campaigns/[id]/send` |
| Campañas proactivas en web chat | Sí | No | — |
| Campañas SMS | Sí | No | — |

## 6. Help Center
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| Portal / centro de ayuda público | Sí | No | — |

## 7. Reportes
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| Panel general | Sí | Sí | `/estadisticas`, `lib/estadisticas/get-stats.ts` |
| Reportes por agente/equipo/etiqueta/bandeja | Sí | Parcial (sin confirmar el desglose) | `get-stats.ts` |
| Primera respuesta / tiempo de resolución | Sí | Parcial | se guarda `firstResponseAt` |
| Reportes de CSAT y SLA | Sí | No | — |
| Costo por chat / uso | No | Sí | `chats/[chatId]/usage` |
| Analítica de plantillas | No | Sí | `templates/[id]/analytics` |

## 8. Administración, seguridad y plataforma
| Función | Chatwoot | Colibly | Evidencia |
|---|---|---|---|
| Roles | Sí (admin/agente + roles personalizados Enterprise) | Parcial (admin/user/ejecutivo fijos) | `lib/roles.ts` |
| Bitácora de auditoría | Sí (Enterprise) | No | — |
| SSO/SAML | Sí (Enterprise) | No | — |
| 2FA | Sí | No (por verificar) | — |
| Estado de disponibilidad del agente | Sí | No | — |
| Notificaciones en la app | Sí | Sí | `Notification`, `notifications/*` |
| Push / correo de notificación | Sí | No (sin webpush) | — |
| Apps móviles | Sí (iOS/Android) | No | — |
| API pública + OpenAPI | Sí | Sí | `/api/v1/*`, `openapi.json` |
| Webhooks salientes con reintentos y rotación de secreto | Sí (básico) | Sí (más completo) | `WebhookDelivery`, `retry`, `rotate-secret` |
| Dashboard apps | Sí | No | — |
| Slack / Linear / Shopify / Google Translate / OpenAI | Sí | No (solo Google Sheets) | `app/api/integrations/google-sheets` |
| Retención de datos / eliminación | Sí | Parcial | eliminación de datos de Meta, `RESPALDOS.md`, respaldos de plataforma |
| Multi-tenant y facturación | Sí (Stripe por agente) | Sí (Stripe por ejecutivo, MXN, prueba, solo lectura) | `lib/billing`, `OrganizationStatus` |
| Superadmin de plataforma | Sí | Sí | `/plataforma` |
| Widget e interfaz multilenguaje | Sí (30+ idiomas) | No (solo español) | — |

## Prioridades (pymes mexicanas en WhatsApp, 1–100 ejecutivos)
### P1: para el lanzamiento y para vender
1. **Notas privadas en el hilo + @menciones**: es la colaboración básica de un equipo; se nota de inmediato en una demo. **S–M**
2. **Horario de atención + mensaje fuera de horario**: lo pide toda pyme; sin él hay fuga de leads de noche. **S**
3. **Posponer (snooze) y prioridad**: necesarios para manejar el volumen en bandeja compartida. **S**
4. **Equipos con asignación por equipo**: ventas/soporte/sucursal es común desde 10 ejecutivos. **M**
5. **Búsqueda en mensajes + vistas o filtros guardados**: "¿dónde quedó ese pedido?". **M**
6. **Acciones masivas** (asignar, cerrar, etiquetar): limpiar la bandeja. **S**
7. **Reportes por ejecutivo** (primera respuesta, resolución, volumen): el dueño los pide para medir a su gente. **M**
8. **Estado de disponibilidad del ejecutivo** (en línea/ausente), usado por la auto-asignación. **S**
9. **Notificaciones push (web push/PWA)**: sin app móvil, sin push se pierden chats. **M**

### P2: pronto
- CSAT por WhatsApp al resolver (encuesta con botones). **S–M**
- Macros. **S**
- Fusionar contactos (duplicados entre canales con el mismo teléfono). **M**
- Importar/exportar contactos CSV fuera del flujo de campañas. **S**
- Resumir/reescribir con IA en el compositor (sale barato sobre lo que ya existe). **S**
- 2FA y bitácora de auditoría básica (para vender a empresas de 30–100). **M**
- Widget web con multimedia y formulario previo al chat. **M**
- Comentarios de Instagram → conversación. **M**
- SLA simple (alerta si no hay respuesta en X min). **M**
- PWA/móvil ligero. **M–L**

### P3: después o no vale la pena
- Canal de email (**L**), SMS (**M**, poco usado en MX), Line (no aplica en MX), voz (**L**).
- Help Center / portal de conocimiento (**L**); el RAG del bot ya cubre la mayor parte del valor.
- SSO/SAML y roles personalizados (**M–L**); solo para enterprise.
- Integraciones con Slack, Linear, Dialogflow y dashboard apps (**M** cada una); Shopify podría subir a P2 para e-commerce.
- Multilenguaje (**M**); no hace falta para el mercado MX.
- Apps nativas iOS/Android (**L**).

## En qué Colibly ya supera a Chatwoot
- WhatsApp Coexistence (app del negocio + API al mismo tiempo), algo que Chatwoot no ofrece.
- CRM de ventas: pipeline de leads, calificación con IA, citas (agendadas también por el bot), secuencias, recuperación de leads.
- Meta Ads: Lead Ads hacia contactos y eventos de conversión (CAPI).
- Constructor visual de automatizaciones con versiones, simulador y registro de ejecuciones.
- Gestión completa de plantillas de WhatsApp (crear, subir medios, analítica) y campañas con segmentación.
- Reglas de enrutamiento por etiqueta, origen o score.
- Comentarios de FB convertidos en conversación con private reply.
- Webhooks con entregas, reintentos y rotación de secreto; costo por chat; créditos de IA.
- Precio en MXN por ejecutivo, en español, sin hosting propio.

Esfuerzo: **S** = días, **M** = 1–2 semanas, **L** = más de un mes (estimado aproximado).

## Siguiente paso propuesto
Arrancar P1 con los tres puntos más baratos y más visibles en una demo:

1. **Notas privadas en el hilo + @menciones** (S–M): nota interna dentro de la conversación (distinta de `WANote`, que es del contacto), visible solo para el equipo, con mención a ejecutivos que genere una notificación en la app.
2. **Horario de atención + mensaje fuera de horario** (S): horario por organización o por cuenta/canal, zona horaria, días feriados y respuesta automática fuera de horario (respetando la ventana de 24 h de WhatsApp).
3. **Posponer (snooze) y prioridad** (S): posponer hasta una fecha u hora o hasta que responda el cliente; prioridad (baja/media/alta/urgente) con filtro y orden en la bandeja.

Después: equipos, búsqueda en mensajes y vistas guardadas, acciones masivas, reportes por ejecutivo, disponibilidad y web push, en ese orden.
