#!/bin/bash
# Builds the demo copy from scratch: fresh database, fictional persona, jobs
# scored and tailored by the app's own AI. Touches only the job-ops-demo
# container and the job-ops-demo-data volume; never the real app's data.
#
#   bash demo/build-demo.sh          # first build
#   bash demo/build-demo.sh --reset  # wipe the demo and rebuild
set -euo pipefail
cd "$(dirname "$0")"
DEMO_DIR="$(pwd)"
BUILD="$DEMO_DIR/.build"
COMPOSE=(docker compose -f "$DEMO_DIR/docker-compose.yml")
URL="http://localhost:3006"
mkdir -p "$BUILD"

wait_healthy() {
  for _ in $(seq 1 90); do
    if curl -sf "$URL/health" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  echo "demo app did not come up"; docker logs --tail 40 job-ops-demo; exit 1
}
in_container() { # run a phase script against the stopped demo database
  docker run --rm --entrypoint node \
    -v job-ops-demo-data:/app/data -v "$DEMO_DIR":/demo:ro \
    -e DEMO_DB=/app/data/jobs.db -e IDS=/demo/.build/ids.json \
    -e DEMO_LLM_API_KEY="${DEMO_LLM_API_KEY:-}" \
    job-ops:local "$@"
}

if docker volume inspect job-ops-demo-data >/dev/null 2>&1; then
  if [[ "${1:-}" != "--reset" ]]; then
    echo "Demo already exists. Use --reset to wipe and rebuild it."; exit 1
  fi
  "${COMPOSE[@]}" down -v
fi

# Login for the demo account (local only), kept out of the repo.
DEMO_PASSWORD="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)"
printf 'Demo app: %s\nUsername: demo\nPassword: %s\n' "$URL" "$DEMO_PASSWORD" > "$BUILD/credentials.txt"
chmod 600 "$BUILD/credentials.txt"

# AI key: copied from the real app's daily backup file (a plain file copy,
# never a second reader on the live database).
LATEST=$(docker exec job-ops sh -c 'ls /app/data/jobs_*.db 2>/dev/null | sort | tail -1' || true)
if [[ -n "$LATEST" ]]; then
  docker cp "job-ops:$LATEST" "$BUILD/key-source.db" >/dev/null
  DEMO_LLM_API_KEY="$(sqlite3 "$BUILD/key-source.db" "select value from settings where key='llmApiKey'")"
  export DEMO_LLM_API_KEY
  rm -f "$BUILD/key-source.db"
fi

echo "== 1/6 first start (creates the database)"
"${COMPOSE[@]}" up -d
wait_healthy
curl -sf -X POST "$URL/api/auth/setup" -H 'Content-Type: application/json' \
  -d "{\"username\":\"demo\",\"password\":\"$DEMO_PASSWORD\",\"displayName\":\"Jordan Lee\"}" >/dev/null
"${COMPOSE[@]}" stop

echo "== 2/6 seed persona, resume and jobs"
in_container /demo/scripts/phase-a-seed.mjs | tail -1 > "$BUILD/ids.json"

echo "== 3/6 start and run the app's own AI over the demo data"
"${COMPOSE[@]}" up -d
wait_healthy
DEMO_PASSWORD="$DEMO_PASSWORD" DEMO_URL="$URL" node "$DEMO_DIR/scripts/phase-b-api.mjs" "$BUILD/ids.json"

echo "== 4/6 stop and backdate history"
"${COMPOSE[@]}" stop
in_container /demo/scripts/phase-c-finish.mjs

echo "== 5/6 start"
"${COMPOSE[@]}" up -d
wait_healthy

echo "== 6/6 done: $URL (login in demo/.build/credentials.txt)"
