# Roadmap competitivo vs Pancake

**Fecha de creación:** 2026-08-06
**Estado:** En progreso — P0/P1/P2 identificados hasta ahora están cerrados, ver "Qué falta" abajo.
**Cómo se generó:** investigación competitiva contra Pancake (CRM de social commerce) en una sesión anterior de Claude Code. **Ese análisis original no se persistió como documento** — solo sobrevivió fragmentado en 3 mensajes de commit y en un par de notas dentro de `AGENTS.md`. Este documento reconstruye lo que se puede reconstruir de esas fuentes y sirve de punto de continuidad para retomar el trabajo desde otro equipo. No asumas que la lista de "Qué falta" es exhaustiva — el análisis original probablemente cubría más terreno del que quedó documentado.

## Alcance decidido

Mantenerse dentro de **CRM conversacional** — explícitamente **fuera de alcance**: POS, inventario, marketplaces. (Decisión registrada en el commit `4c66ce8`, sin más detalle sobre qué otras categorías se evaluaron y descartaron.)

## Cerrado

### P0 — Bug de recuperación/calificación de leads por canal
Commit `86f9da9` (2026-08-05).

- `lib/workers/lead-recovery-worker.ts` despachaba el envío de reactivación asumiendo siempre Telegram; una cuenta de Messenger/Instagram (credenciales sin `botToken`) fallaba en silencio y la recuperación nunca ocurría para esos dos canales.
- Fix: despacho por `channel` real de la `ChannelAccount` + nuevo `lib/meta-messaging/lead-recovery.ts:sendMetaChannelRecoveryMessage()`.
- De paso, `lib/workers/lead-scoring-worker.ts` se corrigió para filtrar explícitamente `channel: "TELEGRAM"` antes de calificar `Conversation` (antes calificaba conversaciones de Messenger/Instagram que la API ya bloquea manualmente con 400 — inconsistencia entre el tick programado y la UI).

### P1 — Citas / Appointments
Commit `4c66ce8` (2026-08-05). Ver `AGENTS.md` → sección "Appointments/Citas" para el detalle de schema/API/UI.

- Gap identificado: Pancake y competidores similares venden hacia verticales de servicio (spas, clínicas, escuelas) con agenda de citas vía call center manual; SundayCRM no tenía ningún concepto de cita.
- Implementado: modelo `WAAppointment` (colgado de `Contact`, no de `WAChat`/`Conversation`), API `/api/whatsapp/appointments`, recordatorios vía cola `appointment-reminders`, UI en `/whatsapp/citas` + sección en `ContactDrawer`.
- **Fase 2 deliberadamente diferida, no construida todavía**: el bot de IA proponiendo una cita durante la conversación (`source: AI_BOT`, ya existe en el enum pero no hay generador). Motivo documentado: ninguna otra feature justificaba aún construir infraestructura de tool-calling estructurado (los providers OpenRouter/Google la implementan distinto); el plan recomendado era un marcador estructurado en la respuesta del modelo, no function-calling real.

### P2 — Campos personalizados
Mismo commit `4c66ce8`. Ver `AGENTS.md` → sección "Custom fields".

- Gap identificado: mismo motivo que Citas (verticales de servicio necesitan campos ad-hoc por negocio: "Talla preferida", "Fecha de nacimiento", etc.) que el schema fijo de `Contact` no cubre.
- Implementado: `ContactCustomFieldDefinition` + `ContactCustomFieldValue`, normalizado (no `Json` blob), mismo patrón dual `waAccountId`/`channelAccountId` que `CannedResponse`. UI en `/configuracion` + `ContactDrawer`.
- Sin pendientes anotados en el commit para este ítem puntual.

## Qué falta (conocido)

1. **Citas — Fase 2**: bot de IA propone citas en la conversación (`WAAppointment.source: AI_BOT`). Requiere diseñar el marcador estructurado en la respuesta del modelo (no tool-calling nativo) y el parseo/confirmación en `bot-worker.ts`.
2. **El resto de la investigación competitiva original no está recuperable** desde este repo — no hay P3 en adelante documentado, ni la lista completa de qué se evaluó y se descartó más allá de "sin POS/inventario/marketplaces". Antes de seguir construyendo sobre este roadmap, considera:
   - Volver a correr la investigación competitiva contra Pancake desde cero (agente de research) para regenerar un gap-analysis actualizado, o
   - Si alguien tiene las notas originales guardadas fuera del repo (doc externo, chat, issue), incorporarlas aquí.

## Cómo continuar desde otro equipo

1. Leer este documento + las secciones referenciadas en `AGENTS.md` ("Appointments/Citas", "Custom fields").
2. Si se retoma Citas Fase 2: empezar por el diseño del marcador estructurado, no por el código — es una decisión de contrato entre el prompt del bot y el parser, y afecta a los dos providers de IA por igual.
3. Si se quiere ampliar el roadmap más allá de P0/P1/P2: regenerar la investigación competitiva (no inventar ítems sueltos) y añadir las secciones correspondientes a este mismo archivo, manteniendo el formato "gap identificado → implementado/pendiente → commit".
