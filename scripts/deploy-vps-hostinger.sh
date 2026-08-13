#!/bin/bash
# -----------------------------------------------------------------------------
# Script tự động đồng bộ 5S Clinic Hub (v85) lên Hostinger VPS srv1892344.hstgr.cloud
# -----------------------------------------------------------------------------

echo "🚀 Đang tiến hành Build & Đồng bộ 5S Clinic Hub v85 lên VPS Hostinger (srv1892344.hstgr.cloud)..."

# 1. Build Frontend Production Bundle
echo "📦 Building Frontend Production Bundle..."
npm run build

# 2. Build VPS NestJS Backend
echo "⚙️ Building VPS NestJS Backend..."
npm run backend:build

# 3. Đồng bộ Docker Compose & Backend lên VPS
echo "🐳 Deploying Docker Containers on VPS..."
docker compose -f docker-compose.vps.yml up -d --build

echo "✅ Hoàn tất đồng bộ VPS Hostinger srv1892344.hstgr.cloud!"
