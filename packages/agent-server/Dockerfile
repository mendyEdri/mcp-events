# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable pnpm

# Use public npm registry for Fly.io build (private registry not accessible)
RUN echo "registry=https://registry.npmjs.org/" > .npmrc

# Copy workspace configuration (exclude lockfile to use public registry)
COPY package.json pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Copy all packages (needed for workspace dependencies)
COPY packages/mcpe ./packages/mcpe
COPY packages/agent-server ./packages/agent-server

# Install dependencies (not using frozen-lockfile since lockfile has private registry URLs)
RUN pnpm install

# Build mcpe first, then agent-server
RUN pnpm --filter @mcpe/core build && \
    pnpm --filter @esmcp/agent-server build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable pnpm

# Use public npm registry
RUN echo "registry=https://registry.npmjs.org/" > .npmrc

# Copy workspace configuration (exclude lockfile to use public registry)
COPY package.json pnpm-workspace.yaml ./

# Copy built packages
COPY --from=builder /app/packages/mcpe/package.json ./packages/mcpe/package.json
COPY --from=builder /app/packages/mcpe/dist ./packages/mcpe/dist

COPY --from=builder /app/packages/agent-server/package.json ./packages/agent-server/package.json
COPY --from=builder /app/packages/agent-server/dist ./packages/agent-server/dist

# Install production dependencies only
RUN pnpm install --prod

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "packages/agent-server/dist/index.js"]
