# ── Build stage ───────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Αντέγραψε package files πρώτα (για cache)
COPY package*.json ./

# Εγκατάσταση dependencies (μόνο production)
RUN npm ci --omit=dev

# Αντέγραψε τον υπόλοιπο κώδικα
COPY . .

# ── Runtime ───────────────────────────────────────────
EXPOSE 8080

# Υγιεινός έλεγχος
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "server.js"]
