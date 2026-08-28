#!/usr/bin/env bash
# Backfill HME drive-thru data for an explicit date range and an explicit
# store list. Reuses /api/hme/sync-store, the same endpoint the scheduled
# sync uses, so the upsert stays keyed on record_id: rerunning any window is
# safe and never double-counts cars.
#
# Usage:
#   ./backfill-hme.sh 2026-08-18 2026-08-27          # all HME-enabled stores
#   ./backfill-hme.sh 2026-08-18 2026-08-27 10008     # single store
#   ./backfill-hme.sh 2026-08-18 2026-08-27 10008,10019
#
# Resumable: if you kill it with ctrl+C, rerunning picks up where it left off.
# Progress lives in backfill-hme-done.txt / backfill-hme-failed.txt.
# Delete backfill-hme-done.txt to start over.
#
# When it finishes, refreshes drive_thru_daily_mv via the same RPC the
# scheduled sync calls.

set -uo pipefail

START="${1:?Missing start date YYYY-MM-DD}"
END="${2:?Missing end date YYYY-MM-DD}"
ONLY_STORES="${3:-}"

DONE_FILE="backfill-hme-done.txt"
FAIL_FILE="backfill-hme-failed.txt"
WINDOW_SECONDS=$(( 70 * 3600 ))   # HME will not serve more than 72h per request.

for v in SUPABASE_URL SUPABASE_SERVICE_KEY APP_URL SYNC_SECRET; do
  [ -n "${!v:-}" ] || { echo "Missing environment variable: $v"; exit 1; }
done

touch "$DONE_FILE" "$FAIL_FILE"

echo "Fetching HME-enabled stores..."
curl -sf "$SUPABASE_URL/rest/v1/stores?active=eq.true&hme_store_number=not.is.null&select=code,name,hme_store_number" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -o hme-stores.json || { echo "Could not fetch stores"; exit 1; }

if [ -n "$ONLY_STORES" ]; then
  jq --arg codes ",$ONLY_STORES," '[.[] | select($codes | contains(",\(.code),"))]' hme-stores.json > hme-stores.filtered.json
  mv hme-stores.filtered.json hme-stores.json
fi

STORE_COUNT=$(jq 'length' hme-stores.json)
[ "$STORE_COUNT" -ge 1 ] || { echo "No stores to process"; exit 1; }

# The request window is padded a day on each side of the calendar range so
# no store's local business date at the edges gets clipped by a UTC
# boundary. Over-fetching is harmless: extra rows just land on business
# dates outside the range, still keyed by record_id.
START_EPOCH=$(( $(date -u -d "$START 00:00:00" +%s) - 86400 ))
END_EPOCH=$(( $(date -u -d "$END 00:00:00" +%s) + 172800 ))
NOW_EPOCH=$(( $(date +%s) - 1200 ))   # HME cloud data runs 15+ min behind, same as the scheduled sync.
[ "$END_EPOCH" -gt "$NOW_EPOCH" ] && END_EPOCH=$NOW_EPOCH

FLOOR_EPOCH=$(( $(date +%s) - 89 * 86400 ))   # HME only retains 90 days.
if [ "$START_EPOCH" -lt "$FLOOR_EPOCH" ]; then
  echo "Note: start date is older than HME's 90-day retention window; clamping to $(date -u -d "@$FLOOR_EPOCH" +%Y-%m-%d)."
  START_EPOCH=$FLOOR_EPOCH
fi

echo "Stores: $STORE_COUNT | Range: $START to $END (padded, UTC epoch $START_EPOCH..$END_EPOCH)"
echo "Already completed: $(wc -l < "$DONE_FILE")"
echo ""

sync_window() {
  local code="$1" hme="$2" s_epoch="$3" e_epoch="$4"
  local s e key resp http body cars

  s=$(date -u -d "@$s_epoch" +%Y-%m-%dT%H:%M:%SZ)
  e=$(date -u -d "@$e_epoch" +%Y-%m-%dT%H:%M:%SZ)
  key="${code}:${s}"

  grep -qxF "$key" "$DONE_FILE" && return 0

  for attempt in 1 2 3; do
    resp=$(curl -s -m 120 -w "\n%{http_code}" -X POST "$APP_URL/api/hme/sync-store" \
      -H "Content-Type: application/json" \
      -H "x-sync-secret: $SYNC_SECRET" \
      -d "{\"storeCode\":$code,\"hmeStoreNumber\":\"$hme\",\"startDateTime\":\"$s\",\"endDateTime\":\"$e\"}")
    http=$(echo "$resp" | tail -n1)
    body=$(echo "$resp" | sed '$d')

    if [ "$http" = "200" ]; then
      cars=$(echo "$body" | jq -r '.cars // 0')
      echo "  OK  $code $s..$e -> $cars cars"
      echo "$key" >> "$DONE_FILE"
      return 0
    fi

    if [ "$http" = "429" ]; then
      sleep $(( attempt * 20 ))
    else
      sleep $(( attempt * 5 ))
    fi
  done

  echo "  FAIL $code $s..$e (HTTP $http)"
  echo "$key http=$http" >> "$FAIL_FILE"
  return 1
}

while read -r code hme; do
  echo "Store $code (HME $hme)"
  cursor=$START_EPOCH
  while [ "$cursor" -lt "$END_EPOCH" ]; do
    chunk_end=$(( cursor + WINDOW_SECONDS ))
    [ "$chunk_end" -gt "$END_EPOCH" ] && chunk_end=$END_EPOCH
    sync_window "$code" "$hme" "$cursor" "$chunk_end"
    cursor=$chunk_end
    sleep 2
  done
done < <(jq -r '.[] | "\(.code) \(.hme_store_number)"' hme-stores.json)

echo ""
echo "=========================================="
echo "Done."
echo "Completed: $(wc -l < "$DONE_FILE")"
echo "Failed:    $(wc -l < "$FAIL_FILE")"
[ -s "$FAIL_FILE" ] && echo "Check $FAIL_FILE and rerun the script to retry."

echo "Refreshing drive_thru_daily_mv..."
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/refresh_drive_thru_views" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
echo "Done."
