#!/bin/bash
# 2026 지방선거 AI 서비스 — Render 배포 스크립트
# 실행: bash deploy.sh
set -e

echo "▶ 1. git 초기화"
git init
git add -A
git commit -m "deploy: 2026 지방선거 AI 웹서비스"

echo "▶ 2. GitHub 레포 생성 + 푸시 (gh CLI 필요: brew install gh / gh auth login)"
REPO_NAME="election-2026-ai"
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push

GITHUB_USER=$(gh api user -q .login)
GITHUB_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}"
echo "  GitHub: $GITHUB_URL"

echo "▶ 3. Render 서비스 생성 (RENDER_API_KEY 필요)"
if [ -z "$RENDER_API_KEY" ]; then
  echo "  ⚠ RENDER_API_KEY 미설정 — 아래 수동 단계 진행:"
  echo "  1) https://dashboard.render.com/new/web 접속"
  echo "  2) Connect Repository → $GITHUB_URL 선택"
  echo "  3) Name: election-2026-ai"
  echo "     Build: npm install"
  echo "     Start: npm start"
  echo "     Plan: Free"
  echo "  4) 'Create Web Service' 클릭"
  echo "  → 배포 완료 후 URL: https://election-2026-ai.onrender.com"
  exit 0
fi

# Render API로 자동 생성
PAYLOAD=$(cat <<EOF
{
  "type": "web_service",
  "name": "election-2026-ai",
  "ownerId": "$(curl -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/owners | jq -r '.[0].owner.id')",
  "repo": "$GITHUB_URL",
  "autoDeploy": "yes",
  "branch": "main",
  "buildCommand": "npm install",
  "startCommand": "npm start",
  "plan": "free",
  "runtime": "node",
  "healthCheckPath": "/api/health"
}
EOF
)

RESPONSE=$(curl -s -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

SERVICE_URL=$(echo "$RESPONSE" | jq -r '.service.serviceDetails.url // .deployedImageUrl // "확인 불가"')
echo "▶ Render 배포 완료: $SERVICE_URL"
