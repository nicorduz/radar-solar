FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 NODE_NO_WARNINGS=1
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev
# El volumen persistente se monta en /data desde el hosting (Railway no acepta la instrucción VOLUME)
EXPOSE 3000
CMD ["node", "server/index.js"]
