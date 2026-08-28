FROM node:22-alpine AS builder
WORKDIR /workspace
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /workspace
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /workspace/dist ./dist

ENV WORK_FOLDER=/app
CMD ["node", "dist/index.js"]
