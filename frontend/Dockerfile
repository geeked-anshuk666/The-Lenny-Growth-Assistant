# Stage 1: Builder — installs deps and produces a static build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_API_URL is baked into the JS bundle at build time.
# Default: empty (App.tsx falls back to http://localhost:8000 at runtime).
# Override at build time with: docker build --build-arg VITE_API_URL=http://your-api
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

# tsc + vite build → dist/ (static HTML, JS, CSS)
RUN npm run build


# Stage 2: Runner — nginx:alpine serves the static bundle (~25MB total image)
FROM nginx:1.27-alpine AS runner

# SPA routing: all unknown paths serve index.html so React Router handles them
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
