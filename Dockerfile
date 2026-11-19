FROM node:22-alpine AS base
# postgresql16-client: pg_dump del respaldo diario (lib/backups); misma versión mayor que el servidor (pgvector/pgvector:pg16).
RUN apk add --no-cache openssl libc6-compat postgresql16-client
WORKDIR /app

FROM base AS dev
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

FROM base AS builder
# URLs públicas que quedan fijas en las páginas prerenderizadas (canonical,
# enlaces de la documentación). Coolify las inyecta solo como build args; el
# job `image` de CI las pasa explícitas (.github/workflows/ci.yml).
ARG APP_URL
ARG SITE_URL
ARG NEXT_PUBLIC_APP_URL
COPY package*.json ./
# --include=dev: Coolify puede inyectar NODE_ENV=production como build-arg (ver
# docker-compose.yml ARG COOLIFY_FQDN/NODE_ENV/etc.), lo que hace que "npm ci" a
# secas omita devDependencies (typescript, @types/*) — Next.js las detecta
# faltantes y las reinstala a medias del build, desperdiciando tiempo. Forzarlas
# aquí no depende de cómo esté configurado ese toggle en la UI de Coolify.
RUN npm ci --include=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
# El build de Next con Turbopack (compilación + type-check de ~90 rutas) excede
# el límite de heap por defecto de V8 (~2GB) y aborta con
# "JavaScript heap out of memory" — visto tanto en local como en el build real
# de Coolify. 4096MB da margen sin acercarse al límite físico del host.
ENV NODE_OPTIONS="--max-old-space-size=4096"
# instrumentation.ts no debe arrancar workers Redis durante el prerender;
# el marcador solo existe en este RUN, no en el contenedor que atiende tráfico.
RUN COLIBLY_BUILD=1 npm run build

FROM base AS runner
RUN apk add --no-cache wget
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Posts del blog (content/blog/*.md): se leen del disco en cada petición.
COPY --from=builder --chown=nextjs:nodejs /app/content ./content
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./
COPY --chown=nextjs:nodejs scripts/startup.sh ./startup.sh
COPY --chown=nextjs:nodejs scripts/db-migrate.sh ./scripts/db-migrate.sh
RUN mkdir -p /app/media && chown nextjs:nodejs /app/media && chmod +x startup.sh
USER nextjs
EXPOSE 5000
CMD ["./startup.sh"]
