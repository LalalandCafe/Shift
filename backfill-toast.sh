#!/usr/bin/env bash
# Backfill historico de ventas Toast para SHIFT.
# Reusa el endpoint /api/toast/sync-store que ya usa el Daily Sync.
#
# Uso:
#   ./backfill-toast.sh 2023-08-01 2026-08-16          # todas las tiendas
#   ./backfill-toast.sh 2023-08-01 2026-08-16 101      # solo tienda 101
#
# Reanudable: si lo matas con ctrl+C, al volver a correr sigue donde quedo.
# El progreso vive en backfill-done.txt (borra ese archivo para empezar de cero).

set -uo pipefail

START="${1:?Falta fecha inicial YYYY-MM-DD}"
END="${2:?Falta fecha final YYYY-MM-DD}"
ONLY_STORE="${3:-}"

PARALLEL=4          # tiendas simultaneas. Sube a 6-8 si Toast aguanta.
DONE_FILE="backfill-done.txt"
FAIL_FILE="backfill-failed.txt"

for v in SUPABASE_URL SUPABASE_SERVICE_KEY APP_URL SYNC_SECRET; do
  [ -n "${!v:-}" ] || { echo "Falta variable de entorno: $v"; exit 1; }
done

touch "$DONE_FILE" "$FAIL_FILE"

# --- Tiendas -----------------------------------------------------------------
echo "Trayendo tiendas activas..."
curl -sf "$SUPABASE_URL/rest/v1/stores?active=eq.true&toast_guid=not.is.null&select=code,toast_guid" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -o stores.json || { echo "No pude traer tiendas"; exit 1; }

if [ -n "$ONLY_STORE" ]; then
  jq --argjson c "$ONLY_STORE" '[.[] | select(.code == $c)]' stores.json > stores.filtered.json
  mv stores.filtered.json stores.json
fi

STORE_COUNT=$(jq 'length' stores.json)
[ "$STORE_COUNT" -ge 1 ] || { echo "Sin tiendas que procesar"; exit 1; }

# --- Fechas (de mas reciente a mas vieja) ------------------------------------
DATES=()
CUR="$END"
while [[ "$CUR" > "$START" || "$CUR" == "$START" ]]; do
  DATES+=("$CUR")
  CUR=$(date -d "$CUR -1 day" +%Y-%m-%d)
done

TOTAL=$(( ${#DATES[@]} * STORE_COUNT ))
echo "Tiendas: $STORE_COUNT | Dias: ${#DATES[@]} | Llamadas totales: $TOTAL"
echo "Ya completadas antes: $(wc -l < "$DONE_FILE")"
echo ""

# --- Worker ------------------------------------------------------------------
sync_one() {
  local code="$1" guid="$2" iso="$3"
  local key="${code}:${iso}"
  local business="${iso//-/}"

  grep -qxF "$key" "$DONE_FILE" && return 0

  for attempt in 1 2 3; do
    resp=$(curl -s -m 120 -w "\n%{http_code}" -X POST "$APP_URL/api/toast/sync-store" \
      -H "Content-Type: application/json" \
      -H "x-sync-secret: $SYNC_SECRET" \
      -d "{\"storeCode\":$code,\"restaurantGuid\":\"$guid\",\"businessDate\":\"$business\",\"isoDate\":\"$iso\"}")
    http=$(echo "$resp" | tail -n1)
    body=$(echo "$resp" | sed '$d')

    if [ "$http" = "200" ]; then
      sales=$(echo "$body" | jq -r '.grossSales // "?"')
      echo "  OK  $code $iso -> \$$sales"
      echo "$key" >> "$DONE_FILE"
      return 0
    fi

    if [ "$http" = "429" ]; then
      sleep $(( attempt * 20 ))
    else
      sleep $(( attempt * 5 ))
    fi
  done

  echo "  FAIL $code $iso (HTTP $http)"
  echo "$key http=$http" >> "$FAIL_FILE"
  return 1
}
export -f sync_one
export APP_URL SYNC_SECRET DONE_FILE FAIL_FILE

# --- Loop principal: un dia a la vez, tiendas en paralelo --------------------
day_num=0
for iso in "${DATES[@]}"; do
  day_num=$(( day_num + 1 ))
  echo "[$day_num/${#DATES[@]}] $iso"

  jq -r '.[] | "\(.code) \(.toast_guid)"' stores.json \
    | xargs -P "$PARALLEL" -I {} bash -c 'set -- {}; sync_one "$1" "$2" "'"$iso"'"'

  sleep 2
done

echo ""
echo "=========================================="
echo "Terminado."
echo "Completadas: $(wc -l < "$DONE_FILE")"
echo "Fallidas:    $(wc -l < "$FAIL_FILE")"
[ -s "$FAIL_FILE" ] && echo "Revisa $FAIL_FILE y vuelve a correr el script para reintentar."
