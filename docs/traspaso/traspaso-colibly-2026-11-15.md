# Traspaso de trabajo · Colibly · 15 nov 2026

Documento para que un nuevo agente retome el trabajo. No contiene contraseñas, tokens ni códigos; las credenciales las da Luis aparte.

## Contexto
- **Colibly:** CRM de WhatsApp e Instagram con IA para pymes mexicanas. Sitio https://colibly.com, app https://app.colibly.com.
- **Dueño:** Luis Islas (CDMX, UTC-6). Escribe en español informal. Programa con Claude Code. Los prompts para Claude se guardan en `docs/prompts/`.
- **Repo:** `ludaisca/Colibly`, privado, rama main. Next.js, Tailwind v4 (tokens en `app/globals.css`), componentes propios en `app/components/ui` sobre Base UI, Prisma y despliegue en Coolify. El deploy lo hace Luis.

## Reglas de trabajo
- Solo opciones gratis. Hay que avisar a Luis antes de cualquier costo.
- Nunca escribir contraseñas, tokens ni códigos en chats, documentos ni commits.
- Para QA solo se usa la cuenta de QA (workspace "Prueba Bobert QA", prueba Pro hasta el 24 nov 2026). Nunca la cuenta del dueño.
- MedicalBuy (workspace "Corporativo Vasa") es estrictamente de solo lectura.
- No se envían mensajes a clientes en nombre de Luis sin una lista y su aprobación.
- En Meta, no tocar las cuentas de WhatsApp ni la app de Colibly sin aprobación.
- El sistema de diseño está congelado: teal como único acento, Barlow, y la franja de color por cuenta. Está documentado en `AGENTS.md` y `CLAUDE.md`. No proponer otra paleta ni otra fuente.
- El WhatsApp público de soporte es el número del bot: +52 1 56 4416 5153 (wa.me/5215644165153). No usar +52 55 6862 3317 como soporte público.

## Lo que se hizo (cronológico, resumido)

### Revisión de la app y rediseño (14 y 15 nov)
1. **Revisión QA funcional completa** de app.colibly.com con la cuenta QA. Encontró 34 hallazgos funcionales, de los cuales 3 eran altos:
   - QA-001: el aviso de cookies tapaba los enlaces de /register en el celular.
   - QA-002: los enlaces de /docs/api llevaban al login.
   - QA-018: no se podían editar ni borrar contactos y no había administrador de etiquetas.
2. **Revisión de diseño:** 25 hallazgos. El veredicto fue que la base es sólida, pero se veía "hecha por IA" por los defaults del kit: paleta cyan de Tailwind, tarjetas KPI idénticas, estados vacíos iguales, banner azul de prueba y un menú de 22 entradas. Se hicieron mockups de antes y después para Panel, Chats y Embudo.
3. **Reporte unificado** con una lista priorizada de 50 acciones. Prompt aplicado: `docs/prompts/prompt-claude-revision-unificada-colibly-2026-11.txt`, en 5 fases.
4. **Claude aplicó el prompt** (commits ab406c5 a da43119) y ya está desplegado:
   - tokens nuevos (primario #0F6E7E, fondo #F4F4F1)
   - franja de KPIs y menú agrupado
   - QA-001 y QA-002 resueltos
   - editar y eliminar contactos
   - /api/health reducido
   - caché de íconos
   - security.txt con contacto@colibly.com
5. **Revisión del trabajo de Claude:** aprobado con correcciones. Prompt `docs/prompts/prompt-claude-correcciones-revision-2026-11-15.txt` (commit bc6c11e), en 5 bloques. Claude lo está trabajando ahora. Incluye:
   - el arrastre del embudo en celular (alto)
   - el aviso al eliminar contacto
   - las acciones masivas que reportan éxito falso
   - la fase 3 incompleta en Chats y Citas
   - la barra inferior en Configuración móvil
   - errores de CSP con Turnstile y con colibly.com
6. **Decisiones de Luis (15 nov):**
   - Conservar el historial de ventas al eliminar un contacto. Se autorizó una migración Prisma no destructiva (SetNull más snapshot).
   - Dejar contacto@colibly.com en security.txt.
   - No borrar todavía los datos QA- de prueba.

### Paquetes publicados (14 nov)
- npm `n8n-nodes-colibly@0.3.0`, desde `integrations/n8n`. Se publica con `--ignore-scripts` porque la guarda de prerelease de n8n-node bloquea la publicación normal.
- npm `colibly@0.1.0`, el SDK de Node (`integrations/sdk-node`).
- PyPI `colibly 0.1.0`, el SDK de Python (`integrations/sdk-python`): https://pypi.org/project/colibly/
- Ambas cuentas (npm y PyPI) se llaman `colibly`. El token de npm vence el 2026-12-14.
- Cada paquete npm tiene un placeholder `0.0.0-stage`. No borrarlos.

### Meta (13 y 14 nov)
- Portafolio verificado Colibly Inc. (ID 1471516364618796): Tech Provider desde el 23 feb 2026. Contiene la app Colibly, los números de WhatsApp, la Página Colibly (1400254513177348), IG @colibly.crm y la cuenta publicitaria "Colibly Ads" (1573472284584061, MXN, sin método de pago).
- Pixel nuevo "Colibly Web 2026" (1116497924612026), configurado en app.colibly.com, en Configuración, sección Medición. Lo sirven colibly.com y app.colibly.com. El pixel viejo 4637872919833858 se renombró a "NO USAR".
- Se quitó a TheCocoBlue del portafolio verificado.
- El portafolio en revisión 1821818635527727 no se puede borrar porque tiene un pixel conectado. La cuenta publicitaria vieja 1657873476129787 está en proceso de cierre.

### Marketing y SEO (9 al 13 nov)
- **Fichas publicadas:** Trustpilot (reclamada), mexsaas (reclamada).
- **Fichas en revisión:** ComparaSoftware, SoftwareSuggest, SourceForge.
- **Search Console:** se corrigió el título de la portada, se sacó /eliminar-datos del sitemap, se limpió robots.txt y se agregó Trustpilot a sameAs.
- **Google Business Profile:** no aplica, porque Colibly no tiene dirección física.
- Hay una rutina mensual de visibilidad en IAs el día 1 a las 9 AM CDMX. La primera corre el 1 dic 2026.

## Pendientes

### Inmediato
1. **Revisar las correcciones de Claude** cuando termine. Hay que verificar commit por commit contra `prompt-claude-correcciones-revision-2026-11-15.txt` y confirmar el CI en verde de cada push. En la migración, revisar que no borre ni reescriba datos.
2. **Deploy:** lo hace Luis. Debe respaldar la base de datos antes, por la migración.
3. **Revisión en vivo después del deploy:**
   - arrastre del embudo en un celular real (táctil)
   - eliminar contacto conserva las ventas en los reportes
   - 0 errores de CSP en /register y colibly.com
   - barra inferior en Configuración móvil
   - "Detalles" del aviso de cookies a 390 px
4. **Datos QA- en "Prueba Bobert QA":** QA-Contacto, QA-Importado, QA-Etiqueta y la cita cancelada "QA-Cita Editada". Ya se pueden borrar desde la UI, pero Luis dijo que todavía no.

### Producto y repo
- Publicar `n8n-nodes-colibly 0.3.1` con la traducción al español cuando esté en el repo. Prompt: `prompt-claude-n8n-espanol-2026-11.txt`, que se le entregó a Luis.
- A los SDKs les falta el archivo LICENSE y el autor. El README del nodo n8n está desactualizado y el lockfile del nodo dice 0.1.0.
- Rotar el token de PyPI de cuenta completa a uno limitado al proyecto colibly.
- Renovar el token de npm antes del 2026-12-14. npm revoca ese tipo de token en enero de 2027.
- Fuera de alcance por ahora:
  - 503 intermitentes de Coolify (QA-007)
  - peso de /docs/api, de unos 1.18 MB (QA-010)
  - nonces de CSP (QA-015)
  - bug del botón atrás (QA-029)
- Sin probar, porque la cuenta QA no tiene canales conectados: envíos, plantillas, campañas, automatizaciones y secuencias.

### Meta
- Confirmar, iniciando sesión con luis.islas@ludaisca.com, que Luis tiene Acceso total al portafolio verificado.
- Luis cerrará la cuenta de Facebook TheCocoBlue en unas 2 semanas. No cerrarla antes.

### Marketing
- Fotos, descripción y enlace de la Página de Facebook y de IG.
- Fichas en Product Hunt y Appvizer. TechMex espera que se defina la ciudad.
- Trustpilot muestra un teléfono incorrecto.
- La ficha de SourceForge no tiene capturas y requiere crear una cuenta para administrarla si la aprueban.
- El mensaje para pedir reseñas (G2 y Trustpilot) está redactado, pero falta la lista de destinatarios aprobada por Luis.

## Archivos de referencia en el repo
- `docs/prompts/prompt-claude-revision-unificada-colibly-2026-11.txt`
- `docs/prompts/prompt-claude-correcciones-revision-2026-11-15.txt`
- `docs/qa/reporte-verificacion-2026-11-14.md`, el reporte de la fase 5 de Claude, hecho en local
- `docs/traspaso/reporte-unificado-colibly-2026-11-14.md`, el reporte unificado de QA y diseño
- `docs/traspaso/revision-trabajo-claude-2026-11-15.md`, la revisión del trabajo de Claude
