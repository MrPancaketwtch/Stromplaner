FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

VOLUME ["/app/data"]
EXPOSE 3001

ENV PORT=3001
ENV DATA_DIR=/app/data/plans

CMD ["node", "server.js"]
