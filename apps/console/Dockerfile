# Build a partir da raiz do monorepo: docker build -f apps/console/Dockerfile -t titan-console .
# Multi-stage — imagem final só carrega o output "standalone" do Next.js (seção 5.1 do prompt
# único), sem o restante do monorepo nem devDependencies.

FROM node:24-slim AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/console ./apps/console
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
RUN pnpm --filter @titan/console... run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /repo/apps/console/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/console/.next/static ./apps/console/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/console/server.js"]
