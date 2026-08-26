#!/usr/bin/env bash
set -euo pipefail

OUT="${1:?Uso: bash scripts/snapshot.sh <directorio>}"
BASE="${BASE_URL:?Falta BASE_URL}"
COOKIE="${COOKIE_FILE:-}"

mkdir -p "$OUT"

DATES="2026-07-15 2026-07-19 2026-07-20 2026-08-13 2026-08-16 2026-08-22 2026-08-23 2026-08-24"
STORES="10019 10004 10030"
WEEKS="2026-08-10 2026-08-17"

# El filtro va en UNA linea a proposito. Repartido en varias, cualquier
# linea perdida al copiar deja la comilla simple abierta y bash reporta
# el error decenas de lineas mas abajo, donde no esta el problema.
FILTER='del(.generatedAt,.lastSyncAt,.debug)'

fetch() {
  url="$1"
  file="$2"

  if [ -n "$COOKIE" ]; then
    body=$(curl -s -b "$COOKIE" "$BASE$url" || true)
  else
    body=$(curl -s "$BASE$url" || true)
  fi

  if printf '%s' "$body" | jq -S "$FILTER" > "$OUT/$file" 2>/dev/null; then
    echo "  ok    $file"
  else
    rm -f "$OUT/$file"
    echo "  FALLO $file  ->  $url"
  fi
}

echo "Capturando en $OUT"

for d in $DATES; do fetch "/api/report?date=$d" "report-$d.json"; done
for d in $DATES; do fetch "/api/kitchen-week?date=$d" "kitchen-$d.json"; done
for w in $WEEKS; do fetch "/api/throughput?weekStart=$w" "tplh-$w.json"; done

for s in $STORES; do
  fetch "/api/store-trend?store=$s&date=2026-08-23&weeks=4" "trend-$s.json"
  fetch "/api/forecast?store=$s&weekStart=2026-08-31" "forecast-$s.json"
  fetch "/api/forecast/hourly?store=$s&weekStart=2026-08-31" "hourly-$s.json"
done

fetch "/api/drive-thru?days=30" "dt-summary.json"
fetch "/api/drive-thru?days=30&storeCode=10008&view=hourly" "dt-hourly.json"

for d in 2026-08-22 2026-08-23; do fetch "/api/dashboard?date=$d" "dash-$d.json"; done

fetch "/api/stores" "stores.json"

echo ""
echo "Listo. $(ls -1 "$OUT" | wc -l) archivos en $OUT"
