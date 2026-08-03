#!/bin/bash
set -e
REPO_URL="https://github.com/7j6y9tzyj4-collab/QuoteCraftAI.git"
cd "$(dirname "$0")"

echo "QuoteCraft AI — GitHub Setup"

if ! command -v git >/dev/null 2>&1; then
  xcode-select --install || true
  echo "Install the Apple command-line tools, then run this file again."
  read -p "Press Enter to close..."
  exit 1
fi

[ -d ".git" ] || git init
git branch -M main

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

git add .
git commit -m "Initial QuoteCraft AI 1.0" || true
git push -u origin main

echo "SUCCESS: QuoteCraft AI is now on GitHub."
read -p "Press Enter to close..."
