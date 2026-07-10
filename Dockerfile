FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends php-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

ENV PHP_PORT=8000
EXPOSE 8080

CMD ["node", "server.js"]
