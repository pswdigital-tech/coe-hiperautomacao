#!/usr/bin/env bash
# =============================================================================
# ignore-build.sh — decide se ESTE projeto Vercel deve buildar ESTE push.
# =============================================================================
# Contexto: os dois projetos da Vercel (coe-hiperautomacao e
# hml-coe-hiperautomacao) apontam para o mesmo repositório. Sem este filtro,
# qualquer push builda os dois — produção subia junto com homologação.
#
# Regra: cada projeto define a env var DEPLOY_BRANCH com a branch que é dele.
# Push numa branch diferente é ignorado.
#
#   coe-hiperautomacao      DEPLOY_BRANCH=main
#   hml-coe-hiperautomacao  DEPLOY_BRANCH=homolog
#
# ATENÇÃO AOS CÓDIGOS DE SAÍDA — eles são invertidos em relação ao intuitivo:
#
#   exit 1  ->  BUILDA
#   exit 0  ->  IGNORA
#
# É a convenção do Ignored Build Step da Vercel ("When the command exits with
# code 1, the build will continue. When the command exits with 0, the build is
# ignored"). Trocar os dois por engano faz produção parar de deployar em
# silêncio, então não mexa sem reler isto.
#
# Ligado ao repo por `ignoreCommand` no vercel.json — que SOBRESCREVE o campo
# "Ignored Build Step" do dashboard. Não configure os dois: este arquivo é a
# fonte da verdade.
# =============================================================================
set -uo pipefail

BRANCH="${VERCEL_GIT_COMMIT_REF:-}"
ALVO="${DEPLOY_BRANCH:-}"

log() { echo "[ignore-build] $*"; }

log "branch='${BRANCH:-<vazia>}' DEPLOY_BRANCH='${ALVO:-<não definida>}' env=${VERCEL_ENV:-?}"

# Deploy pela CLI (`vercel deploy --prod`) pode chegar sem metadados de git.
# Nesse caso quem mandou o comando já escolheu o projeto — não é nossa alçada
# barrar.
if [[ -z "$BRANCH" ]]; then
  log "sem branch no contexto (deploy manual pela CLI) — buildando."
  exit 1
fi

# Fail-open de propósito: se a variável não foi configurada, o comportamento
# volta a ser o de antes (builda) em vez de derrubar todos os deploys em
# silêncio. O log abaixo é o aviso de que falta configuração.
if [[ -z "$ALVO" ]]; then
  log "DEPLOY_BRANCH não definida neste projeto — buildando por precaução."
  log "Defina-a em Settings > Environment Variables, nos 3 ambientes."
  exit 1
fi

if [[ "$BRANCH" == "$ALVO" ]]; then
  log "branch é a deste projeto — buildando."
  exit 1
fi

# Escape hatch: sem isto, este projeto para de gerar preview de PR/feature
# branch. Ligue DEPLOY_PREVIEWS=1 no projeto de homologação se quiser manter
# os previews de branch lá.
if [[ "${DEPLOY_PREVIEWS:-0}" == "1" ]]; then
  log "branch não é a deste projeto, mas DEPLOY_PREVIEWS=1 — buildando preview."
  exit 1
fi

log "branch '$BRANCH' não é '$ALVO' — build ignorado."
exit 0
