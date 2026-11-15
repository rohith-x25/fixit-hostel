FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
ENV PORT=3000 DB_FILE=/data/data.db
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "src/server.js"]