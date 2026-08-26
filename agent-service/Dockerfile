# Stage 1: Builder - compiles TypeScript and installs ALL deps (including devDeps)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Install everything (devDependencies needed for tsc)
RUN npm ci

COPY . .
# Compile TypeScript → dist/
RUN npm run build


# Stage 2: Runner - only compiled JS + production node_modules
FROM node:22-alpine AS runner

WORKDIR /app

COPY package*.json ./
# Install ONLY production dependencies - excludes ts-node-dev, typescript, @types/*
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
