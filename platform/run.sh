#!/bin/sh
# Start the Gridzilla platform with settings from platform/.env (never committed).
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
exec ../.venv/bin/python gridzilla.py
