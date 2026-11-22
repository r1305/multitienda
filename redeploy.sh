#!/bin/bash
# Redeploy multitienda-node en cPanel: git + npm + reinicio Passenger.
#
# Uso (en el servidor):
#   bash redeploy.sh
#   APP=... CPANEL_USER=... NODE_VERSION=... bash redeploy.sh
#   RAMA=otra-rama bash redeploy.sh
#
# Variables opcionales:
#   RAMA          rama a desplegar (default: master)
#   APP           nombre de la app en cPanel (default: carpeta del repo)
#   CPANEL_USER   usuario de cPanel (default: basename de $HOME)
#   NODE_VERSION  version de Node del nodevenv (default: la mas alta que exista en nodevenv/$APP, ej. 24)
#
# Activa /home/$CPANEL_USER/nodevenv/$APP/$NODE_VERSION/bin/activate y entra al repo.

set -euo pipefail

RAMA="${RAMA:-master}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(basename "$RAIZ")}"
CPANEL_USER="${CPANEL_USER:-$(basename "$HOME")}"
if [ -z "${NODE_VERSION:-}" ]; then
  NODE_VERSION="$(ls -1 "/home/$CPANEL_USER/nodevenv/$APP" 2>/dev/null | grep -E '^[0-9]+$' | sort -n | tail -1 || true)"
fi
NODE_VERSION="${NODE_VERSION:-24}"
ACTIVATE="/home/$CPANEL_USER/nodevenv/$APP/$NODE_VERSION/bin/activate"

fallo() {
  echo "ERROR: $1" >&2
  exit 1
}

[ -f "$ACTIVATE" ] || fallo "no existe $ACTIVATE; revisa APP, CPANEL_USER o NODE_VERSION"
set +u
source "$ACTIVATE" || fallo "source $ACTIVATE falló."
set -u
cd "$RAIZ"
[ "$RAIZ" = "/home/$CPANEL_USER/$APP" ] || echo "WARN: el repo ($RAIZ) no coincide con /home/$CPANEL_USER/$APP; se usa el repo real." >&2

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
command -v node >/dev/null || fallo "node no está en el PATH tras activar $ACTIVATE."
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
