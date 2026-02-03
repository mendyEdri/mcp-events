# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable pnpm

# Use public npm registry for Fly.io build (private registry not accessible)
RUN echo "registry=https://registry.npmjs.org/" > .npmrc

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Copy all packages (needed for workspace dependencies)
COPY packages/core ./packages/core
COPY packages/client ./packages/client
COPY packages/agent-server ./packages/agent-server

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build core first, then client, then agent-server
RUN pnpm --filter @esmcp/core build && \
    pnpm --filter @esmcp/client build && \
    pnpm --filter @esmcp/agent-server build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable pnpm

# Use public npm registry
RUN echo "registry=https://registry.npmjs.org/" > .npmrc

# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built packages
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/core/dist ./packages/core/dist

COPY --from=builder /app/packages/client/package.json ./packages/client/package.json
COPY --from=builder /app/packages/client/dist ./packages/client/dist

COPY --from=builder /app/packages/agent-server/package.json ./packages/agent-server/package.json
COPY --from=builder /app/packages/agent-server/dist ./packages/agent-server/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "packages/agent-server/dist/index.js"]
