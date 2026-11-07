# Impeccable (copia vendorizada)

Origen: `pbakaus/impeccable`, commit `687bc38` (2026-11-06), Apache-2.0 (ver `LICENSE`).
Solo la carpeta de la skill (`.claude/skills/impeccable`), **sin el plugin ni sus hooks**.

- El lanzador `scripts/impeccable` descarga la primera vez su motor (Rust, código abierto) de los
  releases de GitHub a `~/.impeccable` y lo verifica contra `scripts/engine-checksums.txt` (SHA-256).
- Los hooks (detector tras cada edición de UI) están apagados; se activan por proyecto con
  `/impeccable hooks on`.
- Modos: **Operate** para el panel (`app/(dashboard)`), **Persuade** para la landing (`app/(marketing)`).
- `PRODUCT.md` / `DESIGN.md`, si se generan, apuntan a `docs/COLOR.md`, `docs/TIPOGRAFIA.md` y
  `docs/arquitectura/frontend.md` en lugar de duplicarlos. Las reglas de Colibly ganan si chocan.

Para actualizar: reemplazar la carpeta con la nueva versión upstream, conservar este archivo y `LICENSE`,
y actualizar el commit de arriba.
