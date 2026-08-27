# Finance Vault chay trong container rieng, khong dung chung image voi backend
# van hanh. Mot lo hong o phan van hanh khong duoc phep thanh duong vao so sach.
FROM node:22-alpine

WORKDIR /app

COPY apps/finance/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY apps/finance/src ./src
COPY apps/finance/public ./public

# Khong chay bang root.
USER node

ENV NODE_ENV=production
EXPOSE 4100

CMD ["node", "src/server.js"]
