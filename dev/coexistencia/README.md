# Stack aislado para la coexistencia de WhatsApp

Compose propio (`colibly-coex`, puerto **15101**) para desarrollar la rama
`feat/wa-coexistencia` sin tocar la base de DEV de las demás ramas. Reutiliza la
imagen `colibly-app:latest` (no construye otra: cuida el LV de Podman) y sus
volúmenes viven en el RAID.

```bash
cp dev/coexistencia/.env.example dev/coexistencia/.env     # y rellena secretos NUEVOS
podman compose -f dev/coexistencia/compose.yml up -d
podman compose -f dev/coexistencia/compose.yml exec app npm install --no-audit --no-fund   # la imagen puede ir atrás de package.json
podman compose -f dev/coexistencia/compose.yml exec app npx tsc --noEmit
podman compose -f dev/coexistencia/compose.yml exec app npm test
podman compose -f dev/coexistencia/compose.yml exec app sh scripts/new-migration.sh <nombre>   # migraciones: solo en este stack
```

## Pruebas de punta a punta (sin Meta real)

Corren **dentro del contenedor**, contra la app en `localhost:5000`, con la base
aislada. Reinicia la app antes (`podman compose -f … restart app`) para que los
workers carguen el código nuevo, y ten en cuenta que `PlatformSettings` se
guarda 30 s en caché (los scripts esperan 32 s tras sembrar).

```bash
for t in 01-webhooks 02-alta-y-sincronizacion 03-carga-y-aislamiento; do
  podman compose -f dev/coexistencia/compose.yml exec -T app node - < dev/coexistencia/pruebas/$t.cjs
done
```

| Script | Qué prueba |
|---|---|
| `01-webhooks` | Verificación GET con el token global; firma de plataforma vs. cuenta manual; ecos del teléfono; historial (progreso, medios, rechazado 2593109); contactos; `PARTNER_REMOVED`; callbacks firmados de desautorización y borrado de datos. |
| `02-alta-y-sincronizacion` | `complete` de Embedded Signup contra un **Meta simulado** (`META_GRAPH_ORIGIN`, solo DEV): coexistencia y número nuevo, errores de Meta, job de sincronización idempotente, vigilancia de tokens y sincronizaciones vencidas. |
| `03-carga-y-aislamiento` | Historial de 3 000 mensajes (el webhook responde en < 1 s, la cola lo procesa), aislamiento entre organizaciones y la salvaguarda de borrado. |

Cada corrida crea organizaciones nuevas; la base aislada conserva los datos
(`down -v` los borra). Nada de esto sale a internet.
