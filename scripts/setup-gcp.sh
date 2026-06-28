#!/bin/bash
set -e

PROJECT_ID="${GCP_PROJECT_ID:?Defina a variavel GCP_PROJECT_ID}"
ZONE="us-central1-a"
VM_NAME="teuscupons-bot"

gcloud config set project "$PROJECT_ID"

gcloud compute instances create "$VM_NAME" \
  --zone="$ZONE" \
  --machine-type="e2-micro" \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --tags=http-server \
  --metadata=startup-script='#!/bin/bash
apt-get update -y
apt-get install -y curl git chromium-browser

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PM2
npm install -g pm2

# Swap 1GB — essencial pro Puppeteer nao morrer no e2-micro (1GB RAM)
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo "/swapfile swap swap defaults 0 0" >> /etc/fstab

mkdir -p /opt/teuscupons
echo "Setup concluido" >> /var/log/teuscupons-setup.log
'

echo ""
echo "VM criada! Aguarde o startup-script terminar (~2 minutos)"
echo "Acompanhe: gcloud compute ssh $VM_NAME --zone=$ZONE -- sudo journalctl -f"
