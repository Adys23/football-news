#!/bin/bash
# Przygotowanie sesji Claude Code w chmurze, zeby hooki pre-commit i pre-push
# (verify, deno:check, verify:db, test:pipeline) daly sie uruchomic bez obchodzenia.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Zaleznosci projektu, w tym Supabase CLI w wersji z package.json.
npm install --no-audit --no-fund

# Deno z npm: dl.deno.land nie jest dostepne z sieci srodowiska.
if ! command -v deno >/dev/null 2>&1; then
  npm install -g deno --no-audit --no-fund
fi

# Daemon Dockera nie startuje w kontenerze sam. Bez niego verify:db nie ruszy.
if command -v dockerd >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  setsid nohup dockerd >/tmp/dockerd.log 2>&1 </dev/null &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || echo "Docker nie wystartowal, zobacz /tmp/dockerd.log" >&2
fi
