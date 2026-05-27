#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[audio-analysis-worker][startup] $*"
}

log "Validando ambiente Python para Demucs/Basic Pitch"
log "which python: $(which python)"
log "which pip: $(which pip)"
log "which demucs: $(which demucs)"

log "Verificando pacote diffq instalado"
pip freeze | grep -i '^diffq=='

check_import() {
  local module="$1"
  log "Testando import de ${module}"
  if ! python -c "import ${module}; print('${module} ok')"; then
    log "ERRO: falha ao importar ${module}. Abortando startup."
    exit 1
  fi
}

check_import diffq
check_import demucs
check_import basic_pitch

log "Ambiente validado com sucesso; iniciando worker"
exec npm start
