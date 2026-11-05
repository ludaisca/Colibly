# Color Colibly

## Decisión (2026-10-25)

**Laguna + coral** en producción.

- Acento de marca: teal `#0E7490` (rellenos, CTAs).
- Neutros fríos sin tinte cielo: fondo `#F3F6F8`, bordes `#D5DCE3`.
- Acento de apoyo: coral `#C21E4C` (`--accent-2`) sobre tinte `#FFE4EA` — badges y highlights, no CTA. El lab usaba `#E11D48`; se oscureció para WCAG AA sobre el tinte.
- Cian `#67E8F9` solo decorativo.

Hex espejo: `lib/brand-colors.ts` ↔ primitivos en `app/globals.css`. Contraste: `lib/design/__tests__/contrast.test.ts`.

Tema oscuro: `.dark` solo remapea semánticos (fondos/textos/tintes); los hex de marca en primitivos no cambian. Toggle compartido panel + sitio público.

## Laboratorio

`/marca/color` — cuatro direcciones conservadas como referencia (no indexado).

| Id | Nombre | Estado |
|---|---|---|
| `actual` | Laguna monocroma | Archivo (cielo en fondos/bordes) |
| `neutros` | Laguna + neutros | Alternativa sin segundo color |
| `arena` | Laguna + arena | Alternativa cálida |
| `coral` | Laguna + coral | **En producción** |
