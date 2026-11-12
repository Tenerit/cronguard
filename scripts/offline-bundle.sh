#!/usr/bin/env bash
# Paquet d'installation HORS LIGNE pour un serveur sans accès Internet (air-gap).
# À lancer sur une machine connectée ; copier ensuite le dossier produit (clé USB, diode…).
#
#   scripts/offline-bundle.sh [dossier] [--with-model]
#
# Contenu : image tout-en-un (docker save), install.sh, SHA256SUMS, et avec --with-model
# l'image Ollama + le modèle d'explication LLM_EXPLAIN_MODEL (≈ 4,7 Go de téléchargement, IA locale).
# Sur le serveur isolé : cd <dossier> && sha256sum -c SHA256SUMS && ./install.sh
set -euo pipefail

OUT="cronguard-offline"; WITH_MODEL=0
for a in "$@"; do case "$a" in --with-model) WITH_MODEL=1 ;; *) OUT="$a" ;; esac; done
MODEL="${LLM_EXPLAIN_MODEL:-qwen2.5:7b-instruct-q4_K_M}"   # le 3B ne passe pas l'éval d'explication
OLLAMA_IMAGE="${OLLAMA_IMAGE:-ollama/ollama:0.5.7}"
TAG="cronguard:$(git rev-parse --short HEAD 2>/dev/null || echo local)"
cd "$(dirname "$0")/.."
mkdir -p "$OUT"
# Monté dans un conteneur : "$PWD/$OUT" casse si OUT est absolu ; pwd -W = chemin Windows sous Git Bash.
OUT_ABS="$(cd "$OUT" && { pwd -W 2>/dev/null || pwd; })"

echo "▸ Image CronGuard ($TAG)"
docker build -q -f Dockerfile.allinone -t "$TAG" . >/dev/null
docker save "$TAG" | gzip > "$OUT/cronguard-image.tar.gz"

if [[ $WITH_MODEL -eq 1 ]]; then
  echo "▸ Ollama ($OLLAMA_IMAGE) + modèle $MODEL"
  docker pull -q "$OLLAMA_IMAGE" >/dev/null
  docker save "$OLLAMA_IMAGE" | gzip > "$OUT/ollama-image.tar.gz"
  vol="cg-bundle-models-$$"
  docker run --rm -v "$vol:/root/.ollama" --entrypoint sh "$OLLAMA_IMAGE" \
    -c "ollama serve >/dev/null 2>&1 & sleep 3 && ollama pull $MODEL"
  docker run --rm -v "$vol:/m" -v "$OUT_ABS:/out" --entrypoint sh "$TAG" -c 'cd /m && tar czf /out/ollama-models.tar.gz .'
  docker volume rm "$vol" >/dev/null
fi

cat > "$OUT/install.sh" <<EOF
#!/usr/bin/env sh
# Installation hors ligne de CronGuard (aucun accès réseau requis).
set -eu
cd "\$(dirname "\$0")"
docker load -i cronguard-image.tar.gz
AI=""
if [ -f ollama-image.tar.gz ]; then
  docker load -i ollama-image.tar.gz
  docker network create cronguard >/dev/null 2>&1 || true
  docker volume create cronguard-ollama >/dev/null
  docker run --rm -v cronguard-ollama:/m -v "\$PWD:/in" --entrypoint sh $TAG -c 'cd /m && tar xzf /in/ollama-models.tar.gz'
  docker run -d --restart unless-stopped --network cronguard --name cronguard-ollama -v cronguard-ollama:/root/.ollama $OLLAMA_IMAGE
  AI="--network cronguard -e LLM_BASE_URL=http://cronguard-ollama:11434/v1 -e LLM_MODEL=$MODEL"
fi
docker run -d --restart unless-stopped -p \${PORT:-3000}:3000 -v cronguard-data:/data \$AI --name cronguard $TAG
echo "CronGuard : http://localhost:\${PORT:-3000}/dashboard"
echo "Créer le compte : ouvrez http://localhost:\${PORT:-3000}/dashboard, puis « Pas encore de compte ? Créer un compte »"
EOF
chmod +x "$OUT/install.sh"

(cd "$OUT" && sha256sum *.tar.gz install.sh > SHA256SUMS)
echo "▸ Paquet prêt : $OUT/"
ls -lh "$OUT" | tail -n +2
