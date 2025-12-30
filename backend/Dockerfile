FROM node:25.2.1-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci && \
    npm cache clean --force && \
    chown -R node:node /app

USER node

COPY --chown=node:node . .

RUN npm run build

FROM node:25.2.1-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev && \
    npm cache clean --force && \
    chown -R node:node /app

USER node

COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
