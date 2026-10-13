FROM node:24-bookworm-slim

# SVG の文字は src/svg.js の SANS / MONO で描く。Linux ではこの 2 つに当たる。
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-dejavu-core \
  && apt-get clean && rm -r /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

USER node
EXPOSE 3000
ENTRYPOINT ["node", "src/server.js", "--config", "/config/config.yaml"]
