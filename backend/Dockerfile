FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev && \
    npm cache clean --force && \
    chown -R node:node /app

USER node

COPY --chown=node:node . .

RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && \
    npm cache clean --force && \
    chown -R node:node /app

USER node

COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
