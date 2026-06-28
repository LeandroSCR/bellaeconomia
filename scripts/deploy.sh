#!/bin/bash
set -e

PROJECT_ID="${GCP_PROJECT_ID:?Defina a variavel GCP_PROJECT_ID}"
ZONE="us-central1-a"
VM_NAME="teuscupons-bot"

echo "Build TypeScript..."
npm run build

echo "Sincronizando arquivos para a VM..."
gcloud compute scp --recurse \
  --zone="$ZONE" \
  ./dist ./package.json ./package-lock.json ./ecosystem.config.js ./.env \
  "$VM_NAME:/opt/teuscupons/"

echo "Reiniciando PM2..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" -- \
  "cd /opt/teuscupons && npm ci --production && (pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js) && pm2 save"

echo "Deploy concluido!"
