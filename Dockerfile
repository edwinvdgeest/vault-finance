# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package*.json ./
RUN npm install --omit=dev express cors
EXPOSE 3001
ENV PORT=3001
ENV DATA_DIR=/app/data
CMD ["node", "server/index.js"]

