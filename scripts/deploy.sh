#!/usr/bin/env bash
# Copy the app to a server with scp, using SSH settings from .env.
#
# Required in .env:
#   SSH_HOST=server.example.com
#   SSH_USER=ubuntu
#   SSH_KEY=~/.ssh/id_ed25519        # path to the private key
#   SSH_REMOTE_PATH=/home/ubuntu/abatask
# Optional:
#   SSH_PORT=22
#
# Usage: scripts/deploy.sh [--with-env]   (--with-env also uploads .env)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }

# Read only the SSH_* vars from .env (avoids sourcing arbitrary content).
get_var() {
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -E 's/^["'\'']|["'\'']$//g' | tr -d '\r'
}
SSH_HOST="$(get_var SSH_HOST)"
SSH_USER="$(get_var SSH_USER)"
SSH_KEY="$(get_var SSH_KEY)"
SSH_PORT="$(get_var SSH_PORT)"
SSH_REMOTE_PATH="$(get_var SSH_REMOTE_PATH)"
SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${SSH_KEY/#\~/$HOME}"

for v in SSH_HOST SSH_USER SSH_KEY SSH_REMOTE_PATH; do
  [ -n "${!v}" ] || { echo "$v is not set in .env" >&2; exit 1; }
done
[ -f "$SSH_KEY" ] || { echo "Private key not found: $SSH_KEY" >&2; exit 1; }

WITH_ENV=0
[ "${1:-}" = "--with-env" ] && WITH_ENV=1

# Stage the files to upload (scp has no exclude option).
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
tar -C "$ROOT" \
  --exclude=./node_modules --exclude=./.git --exclude=./.env \
  --exclude=./data --exclude=./old-sqlite-data --exclude='*.db*' \
  --exclude=./.DS_Store -cf - . | tar -C "$STAGE" -xf -
[ "$WITH_ENV" = 1 ] && cp "$ENV_FILE" "$STAGE/.env"

SSH_OPTS=(-i "$SSH_KEY" -o IdentitiesOnly=yes)
TARGET="$SSH_USER@$SSH_HOST"

echo "Creating $SSH_REMOTE_PATH on $SSH_HOST..."
ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" "$TARGET" "mkdir -p '$SSH_REMOTE_PATH'"

echo "Copying files..."
scp "${SSH_OPTS[@]}" -P "$SSH_PORT" -r "$STAGE"/. "$TARGET:$SSH_REMOTE_PATH/"

echo "Done. On the server run: cd $SSH_REMOTE_PATH && npm install --omit=dev && npm start"
