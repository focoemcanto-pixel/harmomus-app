#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[audio-analysis-worker][startup] $*"
}

log "Validando ambiente Python para librosa/yin"
log "which python: $(which python)"
log "which pip: $(which pip)"

check_import() {
  local module="$1"
  log "Testando import de ${module}"
  if ! python -c "import ${module}; print('${module} ok')"; then
    log "ERRO: falha ao importar ${module}. Abortando startup."
    exit 1
  fi
}

check_import librosa
check_import numpy

log "Ambiente validado com sucesso; iniciando worker"
exec npm start
