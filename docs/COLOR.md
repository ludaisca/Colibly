# Color Colibly

## Decisión vigente (congelada, noviembre 2026)

Un solo acento teal y neutros cálidos de una sola temperatura. **No cambiar paleta, fuentes ni metáfora visual sin aprobación explícita de Luis. Las propuestas van en un issue, no en un commit.** El detalle (tokens, tipografía, radios, componentes) está en `AGENTS.md` → "Dirección de diseño".

- Acento: `#0F6E7E` (relleno con texto blanco), hover `#0B5864`, texto de marca `#0B5D6A` (≥ 7:1 sobre blanco), tinte `#E3F0F1`, borde decorativo `#A9CFD4`.
- Neutros: fondo `#F4F4F1`, superficie `#FFFFFF`, superficie 2 `#EEEEEA`, filete `#E1E1DB`, borde de controles `#93948D`, tinta `#17181A`, texto 2 `#5E5F5A`, metadatos `#8A8B84` (solo ≥ 12 px).
- Estados: éxito `#1F6B45`, espera/SLA `#9A4A0B`, peligro `#B3261E`, información `#2F5D8A`, cada uno con su fondo y borde tenues.
- Sin acento de apoyo: el coral (`--accent-2`) y el cian decorativo se retiraron del panel.
- Tema oscuro (uno solo): lienzo `#111211`, superficie `#18191A`, superficie 2 `#222321`, filete `#2E2F2C`, texto `#ECECE8`, texto 2 `#A3A49E`, relleno de acento `#0F6E7E` con texto blanco, texto de acento y foco `#5FB8C4`. El tema AMOLED se retiró.

Hex espejo: `lib/brand-colors.ts` ↔ `app/globals.css`. Contraste: `lib/design/__tests__/contrast.test.ts`.

**Tema de Astryx (2026-11-21).** Desde la migración a Astryx los componentes se pintan con el tema `themes/colibly/` (se edita solo con `npx astryx experimental theme editor …`; `src/themes/colibly/colibly.css` es la copia generada), que usa esta misma paleta. Ajustes aprobados donde se desvía (`rediseno-astryx/DECISION.md`): en oscuro el relleno de acento es `#00869A` con texto casi negro y el de peligro `#C04C40`; el toast de error va en rojo lleno con texto blanco; el ítem activo del menú usa el borde decorativo `#A9CFD4` (oscuro `#24474C`). Contraste del tema: `lib/design/__tests__/astryx-theme-contrast.test.ts`.

## Historial

Colibrí (violeta) → Menta y grafito → Laguna (2026-10-24) → Laguna + coral (2026-10-25) → Andén (2026-11-07) → paleta congelada (2026-11-14) → misma paleta en el tema de Astryx (2026-11-21). Los laboratorios están en el historial de git.
