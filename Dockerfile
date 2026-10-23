# Hospedagem própria: dados gravados na pasta /data (monte um volume para não perder).
#   docker build -t faturamento-medico .
#   docker run -d -p 3000:3000 -v faturamento-dados:/data -e ADMIN_EMAILS=voce@empresa.com.br faturamento-medico
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
VOLUME /data
EXPOSE 3000
CMD ["node", "server/node-server.js"]
