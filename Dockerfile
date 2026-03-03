FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json .
RUN npm install --omit=dev

# Copy bot code
COPY bot.js .

CMD ["node", "bot.js"]
