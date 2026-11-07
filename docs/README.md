# Índice de documentación

Vigentes primero. Las reglas de trabajo viven en [`../CLAUDE.md`](../CLAUDE.md) y [`../AGENTS.md`](../AGENTS.md); el detalle técnico por módulo, en [`arquitectura/`](arquitectura/) (el mapa está al inicio de `AGENTS.md`).

## Para retomar el trabajo

| Documento | Para qué |
|---|---|
| [CONTINUIDAD_2026-10-04.md](CONTINUIDAD_2026-10-04.md) | **Empieza aquí**: estado, pendientes en orden y cómo retomar (coexistencia, respaldos, ramas). |
| [PLAN_MEJORAS_FASES_2026-11-01.md](PLAN_MEJORAS_FASES_2026-11-01.md) | **Vigente**: plan de 4 fases de mejoras, qué se implementó, decisiones y pendientes (SLA, equipos, FAQ, merge). |
| [PLAN_LANZAMIENTO.md](PLAN_LANZAMIENTO.md) | Plan maestro: decisiones, marca, dominio, legal, Meta, Stripe. |
| [TIPOGRAFIA.md](TIPOGRAFIA.md) | Fuentes en producción (Newsreader + Figtree) y reserva (Syne + DM Sans). |
| [COLOR.md](COLOR.md) | Paleta Laguna: problema de monocromía y direcciones en `/marca/color`. |
| [CONTINUIDAD_LANDING_CPANEL_2026-10-01.md](CONTINUIDAD_LANDING_CPANEL_2026-10-01.md) | **Histórico**: la landing en cPanel ya no existe; `colibly.com` lo sirve Next.js y `cpanel-site/` se eliminó (2026-11-05). |
| [INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md](INFRAESTRUCTURA_BETA_CONTABO_LUDAISCA.md) | Plan A (Contabo) y plan B (ludaisca), DNS, correo. |
| [DOMINIOS_Y_LANDING_BETA.md](DOMINIOS_Y_LANDING_BETA.md) | Separación `colibly.com` / `app.colibly.com`. |
| [BITACORA_LANZAMIENTO_2026-10-19.md](BITACORA_LANZAMIENTO_2026-10-19.md) | **Vigente**: bitácora del pulido de lanzamiento (decisiones, planes, API, Meta, Stripe, producción) y pendientes. |
| [PLAN_IMPLEMENTACION_BENCHMARK_2026-11-01.md](PLAN_IMPLEMENTACION_BENCHMARK_2026-11-01.md) | **Vigente**: plan de implementación por bloques (A–F) de la segunda revisión, con la definición de terminado. |
| [API_WEBHOOKS_AUDITORIA_2026-11-04.md](API_WEBHOOKS_AUDITORIA_2026-11-04.md) | **Vigente**: auditoría en producción de la API `/api/v1` y los webhooks (13 hallazgos), análisis externo verificado y plan P0–P2 para dejar el contrato completo. |
| [PLAN_LICENCIAS_2026-11-04.md](PLAN_LICENCIAS_2026-11-04.md) | **En curso**: licencias por usuario (Básico $59 / Avanzado $89 / Pro $149) que se mezclan en una organización; cada licencia, un canal de cada tipo; el precio sube por funciones. Modelo, cambios en datos, candados, Stripe y pantallas, fases y migración de clientes. |
| [META_JSON_CUENTAS_WA_2026-11-04.md](META_JSON_CUENTAS_WA_2026-11-04.md) | **Vigente**: JSON real que Graph devuelve de una cuenta de WhatsApp (número, perfil, WABA), qué usa Colibly y 5 hallazgos (webhook de dev inalcanzable, calidad mal guardada, `health_status`, versiones de Graph mezcladas). Coexistencia pendiente de una cuenta real. |
| [RENDIMIENTO_2026-11-04.md](RENDIMIENTO_2026-11-04.md) | **Vigente**: diagnóstico de velocidad (polling, consultas, carga en producción), arreglos ya hechos y plan R1–R8 tomado de Chatwoot y Twenty. |
| [BENCHMARK_CHATWOOT_TWENTY_2026-11-01.md](BENCHMARK_CHATWOOT_TWENTY_2026-11-01.md) | **Vigente**: segunda revisión de Chatwoot y Twenty: 18 funciones y 10 patrones de UI/UX que faltan, con prioridad y orden propuesto. |
| [ROADMAP_PARIDAD_CHATWOOT.md](ROADMAP_PARIDAD_CHATWOOT.md) | Brechas frente a Chatwoot (P1/P2/P3 con esfuerzo) y siguiente paso propuesto. |
| [PRECIOS_POR_EJECUTIVO_2026-10-19.md](PRECIOS_POR_EJECUTIVO_2026-10-19.md) | **Superado** por [PLAN_LICENCIAS_2026-11-04.md](PLAN_LICENCIAS_2026-11-04.md) (licencias por usuario); rige solo a organizaciones con `legacyUntil`. |
| [OFERTA_BETA_COLIBLY.md](OFERTA_BETA_COLIBLY.md) | Propuesta de oferta beta (superada: registro abierto y precio por ejecutivo). |
| [INVENTARIO_UI_2026-11-07.md](INVENTARIO_UI_2026-11-07.md) | **Vigente**: inventario de componentes y librerías de UI, qué ofrece Tesela y reparto propuesto (Base UI + piezas portadas de Tesela + capa propia) para la nueva interfaz. |
| [INVENTARIO_MODALES_2026-11-07.md](INVENTARIO_MODALES_2026-11-07.md) | **Vigente**: los 53 modales y 33 confirmaciones clasificados con la regla de Impeccable (modal solo si interrumpe con razón): se quedan 19, 17 a cajón lateral, 12 cortos y 5 en línea; plan para pasar `Modal` a Base UI. |
| [AUDITORIA_UI_2026-11-07.md](AUDITORIA_UI_2026-11-07.md) | **Vigente**: primera auditoría de `app/components/ui/` con Web Design Guidelines y el detector de Impeccable (teclado/ARIA de menús propios, foco, animación, desvíos de `DESIGN.md`). `PRODUCT.md` y `DESIGN.md` (raíz) son el contexto de Impeccable. |
| [RESPALDOS.md](RESPALDOS.md) | Respaldo diario de la base a S3/R2: configuración, restauración y límites. |

## Revisiones de interfaz (sept. 2026)

[REVISION_VISUAL_2026-09-29](REVISION_VISUAL_2026-09-29.md) · [REVISION_ESTADOS_ACCESIBILIDAD_RENDIMIENTO_2026-09-29](REVISION_ESTADOS_ACCESIBILIDAD_RENDIMIENTO_2026-09-29.md) · [REVISION_MODALES](REVISION_MODALES.md) · [CIERRE_ACCESIBILIDAD](CIERRE_ACCESIBILIDAD_2026-09-30.md) · [CIERRE_CONSISTENCIA](CIERRE_CONSISTENCIA_2026-09-30.md) · [CIERRE_RECORRIDO_VISUAL](CIERRE_RECORRIDO_VISUAL_2026-09-30.md) · [CIERRE_RENDIMIENTO_VISUAL](CIERRE_RENDIMIENTO_VISUAL_2026-09-30.md) · [REACT_FLOW_FUNCIONAL](REACT_FLOW_FUNCIONAL_2026-09-30.md)

## Históricos (nombre anterior SundayCRM/SunflowCRM)

| Documento | Nota |
|---|---|
| [PLAN_ROADMAP.md](PLAN_ROADMAP.md), [ROADMAP_PANCAKE.md](ROADMAP_PANCAKE.md) | Roadmap competitivo de agosto 2026; P0–P3 cerrados. |
| [AUDIT_2026-07-17.md](AUDIT_2026-07-17.md), [AUDIT_2026-09-16.md](AUDIT_2026-09-16.md) | Auditorías; la segunda tiene registro de ejecución. |
| [REORGANIZACION_MENU.md](REORGANIZACION_MENU.md), [FORK_PLAN.md](FORK_PLAN.md) | Decisiones de navegación y de fork, ya aplicadas. |

## Pendiente conocido

Ver la lista de pendientes en [BITACORA_LANZAMIENTO_2026-10-19.md](BITACORA_LANZAMIENTO_2026-10-19.md#12-pendientes). (La prueba es de 14 días en todo el producto desde 2026-10-19; antes, 30.)
