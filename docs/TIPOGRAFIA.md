# Tipografía Colibly

Decisión **2026-10-25** (laboratorio `/marca/tipografia`).

## En producción

| Rol | Fuente | Token / clase |
|---|---|---|
| **Display** (títulos, marca, precios grandes, wordmark) | **Newsreader** | `--font-display` → `font-display` |
| **Body** (párrafos, UI, nav) | **Figtree** | `--font-body` → `--font-sans` |

Carga: `next/font/google` en `app/layout.tsx`. El sitio cPanel (`cpanel-site/assets/site.css`) debe usar el mismo par.

Par anterior (histórico): Bricolage Grotesque + Hanken Grotesk.

## Reserva

Si Newsreader + Figtree no convence en el panel (densidad de listas/chats) o se quiere un display más “tech”:

| Rol | Fuente |
|---|---|
| Display | **Syne** |
| Body | **DM Sans** |

Nombre en el laboratorio: **Geométrica viva**. No está cargada en producción; para activarla, cambiar los loaders en `app/layout.tsx` (y el `@import` de `cpanel-site/assets/site.css`) y actualizar esta nota.

## Laboratorio

`/marca/tipografia` — comparación de pares (no indexado). Ahí sigue el histórico y la reserva marcados.
