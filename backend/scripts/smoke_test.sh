#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000}"

echo "Checking $BASE_URL/health"
curl -fsS "$BASE_URL/health" >/dev/null
echo "Checking $BASE_URL/docs"
curl -fsS "$BASE_URL/docs" >/dev/null
echo "Smoke test passed."
