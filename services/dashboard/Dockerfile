FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /app/data /app/keys

EXPOSE 3456

CMD ["node", "server.js"]
