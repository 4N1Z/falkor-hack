# Base node image
# Node 22+: PDF.js (via unpdf) needs the Iterator global; on Node 20 every PDF read fails and Adam sees abstracts only
FROM node:22-alpine AS base
WORKDIR /app
# Add Chrome dependencies
RUN apk add --no-cache chromium

# Dependencies stage
FROM base AS deps
RUN apk add --no-cache libc6-compat

# Install pnpm (pin version to avoid corepack signature issues)
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile  && \
    pnpm store prune

# Builder stage
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG DATABASE_URL

ENV DATABASE_URL=${DATABASE_URL}
ENV NODE_ENV=${NODE_ENV}
ENV AUTH_TRUST_HOST=${AUTH_TRUST_HOST}
ENV NEXT_TELEMETRY_DISABLED 1

RUN pnpm build && \
    rm -rf .next/cache && \
    find . -name "*.map" -delete

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
# Add Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]