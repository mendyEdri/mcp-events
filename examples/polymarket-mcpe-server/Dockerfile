# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install typescript globally to avoid npm install issues
RUN npm install -g typescript

# Copy package files
COPY package.json ./

# Install dependencies with retry
RUN npm install --legacy-peer-deps || npm install --legacy-peer-deps || npm install --legacy-peer-deps

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN tsc

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Copy package files
COPY package.json ./

# Install production dependencies with retry
RUN npm install --omit=dev --legacy-peer-deps || npm install --omit=dev --legacy-peer-deps

# Copy built files
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
