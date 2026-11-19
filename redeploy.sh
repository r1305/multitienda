#!/bin/bash
# Redeploy multitienda-node en cPanel: git + npm + reinicio Passenger.
#
# Uso (en el servidor):
#   bash redeploy.sh
#   RAMA=otra-rama bash redeploy.sh
#   NODE_BIN=/ruta/a/nodevenv/bin bash redeploy.sh   (opcional)
#
# Variables opcionales:
#   RAMA       rama a desplegar (default: shipness)
#   NODE_BIN   carpeta bin del Node de la app; si se define se antepone a PATH,
#              si no se usa el node del PATH del servidor

set -euo pipefail

RAMA="${RAMA:-shipness}"

cd "$(dirname "${BASH_SOURCE[0]}")"
RAIZ="$(pwd)"

fallo() {
  echo "ERROR: $1" >&2
  exit 1
}

echo "========================================"
echo "  Redeploy multitienda-node"
echo "  Repo: $RAIZ"
echo "  Rama: $RAMA"
echo "========================================"

echo ""
echo "==> [1/4] Actualizando código (solo fast-forward)..."
git fetch origin || fallo "git fetch falló. Revisa red/credenciales; no se tocó nada."
git checkout "$RAMA" || fallo "git checkout $RAMA falló (¿cambios locales sin commitear?). Resuélvelo a mano."
git pull --ff-only origin "$RAMA" || fallo "git pull --ff-only falló (historia divergida o cambios locales). Resuélvelo a mano; el script no hace reset ni force."

echo ""
echo "==> [2/4] Instalando dependencias con Node de la app..."
if [ -n "${NODE_BIN:-}" ]; then
  [ -x "$NODE_BIN/node" ] || fallo "no existe $NODE_BIN/node (revisa NODE_BIN)."
  export PATH="$NODE_BIN:$PATH"
fi
command -v node >/dev/null || fallo "node no está en el PATH (define NODE_BIN)."
echo "    node $(node -v) / npm $(npm -v)"
npm install --omit=dev

echo ""
echo "==> [3/4] Verificando sintaxis de passenger_app.js..."
node --check passenger_app.js || fallo "node --check passenger_app.js falló; NO se reinicia la app."

echo ""
echo "==> [4/4] Reiniciando app (Passenger: tmp/restart.txt)..."
mkdir -p tmp
touch tmp/restart.txt

echo ""
echo "==> Listo. Rama $RAMA en $(git rev-parse --short HEAD)."
