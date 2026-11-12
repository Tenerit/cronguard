# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Supprime les devDependencies pour alléger l'image
RUN npm prune --production --ignore-scripts

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Sécurité : utilisateur non-root
RUN addgroup -S cronguard && adduser -S cronguard -G cronguard

# Copie uniquement ce dont l'app a besoin
COPY --from=builder --chown=cronguard:cronguard /app/dist         ./dist
COPY --from=builder --chown=cronguard:cronguard /app/node_modules ./node_modules
COPY --from=builder --chown=cronguard:cronguard /app/package.json ./

# Copie les fichiers HTML du dashboard
COPY --chown=cronguard:cronguard src/api/dashboard.html src/api/dashboard.css src/api/dashboard-i18n.js src/api/dashboard.js ./dist/api/
COPY --chown=cronguard:cronguard src/api/status.html    ./dist/api/
COPY --chown=cronguard:cronguard sdk/bash/cronguard.sh   ./sdk/bash/

USER cronguard
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/api/index.js"]
