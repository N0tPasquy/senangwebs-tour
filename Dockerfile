# ==========================================
# Stage 1: Build static distribution bundles
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci

# Copy build configuration and source files
COPY rollup.config.js ./
COPY src/ ./src/
COPY examples/ ./examples/

# Compile bundles into dist/
RUN npm run build

# Prepare production web root:
# 1. Place dist bundles in /public/dist/
# 2. Place examples in /public/examples/
# 3. Create /public/index.html directly from examples/editor.html with updated relative asset paths
RUN mkdir -p /public/dist /public/examples && \
    cp -r dist/* /public/dist/ && \
    cp -r examples/* /public/examples/ && \
    sed 's|\.\./dist/|dist/|g' examples/editor.html > /public/index.html

# ==========================================
# Stage 2: Production Nginx runtime
# ==========================================
FROM nginx:alpine AS runner

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy optimized nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled web assets and editor index.html
COPY --from=builder /public /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
