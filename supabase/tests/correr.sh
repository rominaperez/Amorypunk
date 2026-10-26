#!/usr/bin/env bash
# Prueba local: base vacía + simulación mínima de Supabase + migraciones + seed + casos de aceptación.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./tests/correr.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=amorypunk_test
dropdb --if-exists "$DB" && createdb "$DB"
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run supabase/tests/00_simular_supabase.sql
for f in supabase/migrations/*.sql; do echo "migración: $(basename "$f")"; run "$f"; done
run supabase/seed.sql
run supabase/tests/10_casos_de_aceptacion.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' | grep -v '^$'
