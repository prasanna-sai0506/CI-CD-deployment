# Stage 1: Builder for preparing dependencies
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json package-lock.json ./
RUN npm ci
COPY . .

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
COPY package*.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

# Clean up development configs
RUN rm -rf tests eslint.config.js Dockerfile .dockerignore .gitignore

# Bake in version control SHA
ARG GIT_SHA=development
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "index.js"]
