# Reporte de verificación — revisión unificada (fases 1 a 4)

Fecha: 14 de noviembre de 2026. Entorno: dev local (`http://localhost:1100`, Docker en `ludaisca`), cuenta de QA `qa-sin-canal@colibly.test` (espacio «Spa QA», sin canales conectados). Capturas en [`reporte-verificacion-2026-11-14/`](reporte-verificacion-2026-11-14/).

## 1. Resumen ejecutivo

- Las cuatro fases quedaron aplicadas en 8 commits (`ab406c5` … `28067c5`) más el de esta verificación.
- Typecheck limpio, lint con 0 errores (los 93 avisos de siempre), 166 archivos de prueba / 1,430 pruebas en verde y el build `builder` de producción pasó al cierre de cada fase.
- 21 de 21 comprobaciones funcionales automatizadas (Playwright) pasan; ninguna de 22 pantallas del panel se desborda a 390 px; 0 errores de consola en el recorrido final.
- No se probó en `app.colibly.com` (el despliegue ocurre al subir estos commits) ni con canales reales: la cuenta de QA no tiene WhatsApp conectado.
- Hallazgos nuevos: 0 críticos, 0 altos, 1 medio, 3 bajos, 3 sugerencias.

## 2. Criterios de aceptación

| Fase | Criterio | Resultado | Evidencia |
|---|---|---|---|
| 1 | QA-001 aviso de cookies como banda de 56 px, no tapa enlaces ni bloquea scroll | Cumplido en código, **no verificado visualmente** | En dev no hay IDs de medición, así que el aviso no se muestra (sección 3). |
| 1 | QA-002 enlaces de `/docs/api` al sitio | Cumplido | Cabecera y menú móvil apuntan a `SITE_URL` (`/#producto`, `/#como-funciona`, `/#preguntas`). |
| 1 | QA-003 sin errores CSP en /login, /register, /recuperar, /docs/api | Cumplido (local) | 0 errores de consola en las cuatro rutas. |
| 1 | QA-004 / QA-016 mensajes de correo y `aria-describedby` | Cumplido | Playwright: «El correo es obligatorio»; input con `aria-describedby`. |
| 1 | QA-019/021/025/026 validaciones | Cumplido | Teléfono inválido bloquea «Guardar contacto»; motivo visible; contador 118/120; «Escribe tu nombre». |
| 1 | QA-023 rango de Reportes desde la URL | Cumplido | Atajo «7 días» → `from=2026-10-25&to=2026-10-31`. |
| 1 | QA-024 estado del bot con una sola función | Cumplido | `lib/bots/display-status.ts` (con pruebas) en tarjeta, tabla, panel y conteo. |
| 1 | QA-005 / QA-011 / QA-013 / QA-014 / QA-028 / QA-030 | Cumplido | `/conectar/<inexistente>` 404 con título sin marca duplicada; `/favicon.ico` y `/registro` 308; sin `X-Powered-By`; botón «Elegir archivo»; «La IA». |
| 1 | D-01 contenido 40 px más arriba en /dashboard, /whatsapp/chat, /ventas | Cumplido | La banda azul ya no existe; tarjeta «Prueba Pro · quedan N días» al pie del menú y en «Más». |
| 1 | D-07 sin animaciones de entrada | Cumplido | 0 usos de `animate-fade-in-up` / `animation-delay-*`. |
| 1 | QA-008 `/api/health` solo `{"status":"ok"}` | Cumplido | Respuesta con la única clave `status`; 503 se conserva si falla la base o Redis. |
| 1 | QA-032 monitores y secuencias inactivos por defecto | Cumplido | `POST /api/monitors` → `active: false`. |
| 2 | Tokens, tema oscuro único, tipografía, radios y sombras | Cumplido | `app/globals.css`; capturas `oscuro-*.png`. |
| 2 | Contraste (#5E5F5A ≥ 4.5, #0F6E7E con blanco ≥ 4.5, #0B5D6A ≥ 7, estados ≥ 4.5, #93948D ≥ 3) | Cumplido | `contrast.test.ts`: 84 pares en verde. |
| 2 | Dirección congelada en AGENTS.md / CLAUDE.md / design.json | Cumplido | Sección «Dirección de diseño (congelada, nov 2026)». |
| 3 | Sin `uppercase` en encabezados de tabla, grupos, pestañas ni KPIs | Cumplido | `git grep uppercase` en panel y componentes = 0. |
| 3 | `rounded-2xl` / `rounded-xl` / `rounded-[9px]` en el panel = 0 | Cumplido | 0 coincidencias. |
| 3 | `IconBox` en empty-state = 0; `Sparkles` = 0 | Cumplido | 0 y 0. |
| 3 | Un solo botón primario por vista (Panel, Chats, Contactos, Embudo, Configuración) | Cumplido | Visibles: 1, 0, 1, 0 y 0 respectivamente. |
| 3 | A 390×844 sin desborde horizontal; pestañas de Configuración no cortadas | Cumplido | 22 rutas medidas; Configuración es una lista en el teléfono. |
| 3 | Arrastrar una tarjeta cambia la etapa y persiste al recargar (test) | Cumplido | Arrastre de la tarjeta completa ida y vuelta, persistido; `board-move.test.ts`. |
| 3 | Editar y eliminar contactos, administrar etiquetas, eliminar citas canceladas (tests de API) | Cumplido | Playwright de punta a punta + `delete-route`, `tag-admin-route` y `appointment-delete-route`. |
| 3 | contrast, lint, typecheck, tests y build | Cumplido | Sección 1. |
| 4 | Sin `font-mono` fuera de código, ni puente; sin `font-bold`/`font-extrabold` | Cumplido | `font-mono` queda solo en código, claves, tokens y URLs; negritas = 0. |
| 4 | Briefs sin texto de generador; contradictorios archivados | Cumplido | Sin `FINISH:` ni `seed:`; brief de la bandeja en `docs/archivo/`. |
| 4 | QA-012 caché de íconos y manifiesto | Cumplido | `Cache-Control: public, max-age=86400` en las tres rutas. |
| 4 | QA-017 `/.well-known/security.txt` | Cumplido con nota | Usa el correo de contacto de la marca (no hay buzón de seguridad propio en el repo). |

## 3. Qué se recorrió y qué no

Recorrido en escritorio (1440×900 y 1280×800) y teléfono (390×844): acceso, Panel, Chats, Contactos, Citas, Embudo, Campañas, Bots IA, Automatizaciones, Secuencias, Plantillas, Estadísticas, Reportes, Calificadores, Monitores, Canales (WhatsApp, Instagram, Messenger, Telegram, Web), Configuración (incluidos Plan, IA y API), Usuarios, Ayuda y Meta Ads. También el tema oscuro (Panel y Embudo).

No se pudo probar:
- **`app.colibly.com`**: estos commits se despliegan al subirlos; la verificación en producción queda para después del deploy.
- **Aviso de cookies (QA-001)**: el dev no tiene IDs de medición, así que el aviso no aparece.
- **Turnstile «interaction-only» (QA-009)**: el dev no tiene llave de Turnstile.
- **Canales reales** (WhatsApp, Instagram, plantillas, catálogo, Flows, llamadas, QR): la cuenta de QA no tiene canal y no se conecta ninguno por regla.
- **Permisos de un rol limitado**: no se creó un usuario `user`/`ejecutivo`. La API de borrado de contactos y etiquetas tiene pruebas de 403 por rol.
- **Arrastre táctil**: se probó con mouse; el TouchSensor queda sin prueba en un dispositivo.

## 4. Hallazgos nuevos

| ID | Sección | URL | Severidad | Tipo | Dispositivo | Pasos | Esperado | Obtenido | Captura |
|---|---|---|---|---|---|---|---|---|---|
| QA-101 | Reportes | /estadisticas/reportes | Medio | Consola | Escritorio | Abrir un rango y pulsar «7 días» | Sin errores de red | Un 404 aislado en la primera corrida; no se reprodujo en una segunda | — |
| QA-102 | Chats | /whatsapp/chat | Bajo | Funcional | Ambos | Ver la pestaña «Después» | Contador como en las demás | Sin contador (`viewCounts` no trae pospuestos) | final-whatsapp_chat-1440.png |
| QA-103 | Contactos | /whatsapp/contactos | Bajo | Texto | Ambos | Ver la columna Etapa | Mismo nombre que el Embudo | Un contacto sin etapa muestra el estado («Nuevo») y otro la etapa («Nuevos») | final-whatsapp_contactos-1440.png |
| QA-104 | Citas | /whatsapp/citas (Mes) | Bajo | Funcional | Teléfono | Vista «Mes» a 390 px | Abrir las citas de un día | Las celdas de 48 px solo muestran un punto; hay que cambiar a «Agenda» | final-whatsapp_citas-390.png |
| QA-105 | Seguridad | /.well-known/security.txt | Sugerencia | Seguridad | — | Leer el archivo | Buzón de seguridad propio | Usa contacto@ | — |
| QA-106 | Sitio | /docs/api | Sugerencia | Visual | — | Navegar desde la app | — | Los enlaces del sitio ahora recargan la página completa (sin prefetch), a propósito por la CSP | — |
| QA-107 | Panel | /dashboard | Sugerencia | Rendimiento | — | Abrir el panel | — | Calcula primera respuesta de 14 días en cada visita (≈0.4 s con 80 k mensajes en dev); valdría una caché corta como la de Estadísticas | — |

## 5. Errores de consola y de red

- Recorrido final de 22 pantallas a 390 px y 8 pantallas en tres tamaños: 0 errores.
- Durante las pruebas funcionales: `409` en `POST /api/whatsapp/contacts` (esperado: el contacto de prueba ya existía de una corrida anterior) y el `404` de QA-101.

## 6. Textos a corregir

| Texto actual | Sugerido |
|---|---|
| Etapas del embudo por defecto en plural («Nuevos», «Calificados») vs. estado en singular («Nuevo») | Unificar el nombre (decisión de producto) |
| «Primeros pasos · 1 de 5» enlaza al siguiente paso con su título («Conecta un canal») | Correcto; sin cambio |

## 7. Datos de prueba y configuraciones tocadas

| Dato | Creado | Borrado |
|---|---|---|
| Contacto «QA-Contacto» (5599990000) | Sí | Sí (desde la tabla, «Eliminar») |
| Etiqueta «QA-Etiqueta» / «QA-Etiqueta-2» | Sí | Sí (Configuración → Etiquetas) |
| Monitor «QA-Monitor» | Sí (API) | Sí (API) |
| Contacto de prueba «Dos» movido entre etapas (arrastre) | — | Regresó a «Nuevos», donde estaba |

Configuraciones: el nombre de la cuenta de QA se borró y se restauró sin guardar (valor antes y después: «Dueña QA»). El tema volvió a claro. Nada más se tocó.

## 8. Top 10 de arreglos pendientes

1. Verificar en `app.colibly.com` tras el deploy, con la cuenta de QA y un canal real (QA-001, QA-009 y bandeja con conversaciones).
2. QA-104: en el teléfono, tocar un día del mes debería abrir sus citas.
3. QA-102: contador de pospuestos para la pestaña «Después».
4. QA-103: unificar nombres de etapa y estado del lead.
5. Probar el arrastre táctil del embudo en un teléfono real.
6. Revisar permisos con un usuario `user` y otro `ejecutivo` (menú por tareas, Usuarios / Meta Ads en el menú de usuario).
7. QA-107: caché corta para la primera respuesta del Panel.
8. QA-105: buzón de seguridad propio para `security.txt`.
9. Revisar las pantallas de detalle (bot, campaña, cuenta) con la nueva escala: solo se ajustaron títulos y radios.
10. Fuera de alcance de esta revisión: QA-007 (503 de Coolify), QA-010 (peso de la docs), QA-015 (nonces de CSP) y QA-029 (navegación atrás).
