FROM node:24-bookworm-slim
WORKDIR /app
COPY *.mjs package.json ./
COPY public/ ./public/
USER node
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
