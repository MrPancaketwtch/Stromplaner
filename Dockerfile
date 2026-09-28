FROM node:22-alpine AS webapp-builder
WORKDIR /webapp
COPY webapp/package*.json ./
RUN npm ci
COPY webapp/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/server.js ./
COPY --from=webapp-builder /webapp/dist /webapp/dist

VOLUME ["/app/data"]
EXPOSE 3001
ENV PORT=3001
ENV DATA_DIR=/app/data/plans
CMD ["node", "server.js"]
