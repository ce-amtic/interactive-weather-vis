#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
GITHUB_OWNER="${GITHUB_OWNER:-ce-amtic}"
GITHUB_REPO="${GITHUB_REPO:-interactive-weather-vis}"
GITHUB_REMOTE_URL="${GITHUB_REMOTE_URL:-git@github.com:${GITHUB_OWNER}/${GITHUB_REPO}.git}"

python_bin() {
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
  elif command -v python >/dev/null 2>&1; then
    command -v python
  else
    echo "python3 or python is required." >&2
    exit 1
  fi
}

validate_files() {
  local missing=0
  for path in index.html src/app.js styles/style.css data/seattle-weather.csv .nojekyll; do
    if [ ! -f "$path" ]; then
      echo "Missing required file: $path" >&2
      missing=1
    fi
  done

  if [ "$missing" -ne 0 ]; then
    exit 1
  fi
}

case "${1:-}" in
  build)
    validate_files
    rm -rf dist
    mkdir -p dist
    cp -R index.html .nojekyll data src styles dist/
    touch dist/.nojekyll
    echo "Static site copied to dist/."
    ;;

  localhost | dev)
    validate_files
    echo "Serving at http://${HOST}:${PORT}/"
    "$(python_bin)" -m http.server "$PORT" --bind "$HOST"
    ;;

  deploy)
    validate_files

    if [ "$GITHUB_OWNER" = "YOUR_GITHUB_USERNAME" ]; then
      echo "Please set your GitHub owner first, for example:"
      echo "  GITHUB_OWNER=your-name GITHUB_REPO=${GITHUB_REPO} ./commands.sh deploy"
      exit 1
    fi

    if ! command -v git >/dev/null 2>&1; then
      echo "git is required for deployment."
      exit 1
    fi

    if ! git config user.name >/dev/null; then
      echo "Missing git user.name. Set it first, for example:"
      echo '  git config user.name "Your Name"'
      exit 1
    fi

    if ! git config user.email >/dev/null; then
      echo "Missing git user.email. Set it first, preferably with a GitHub noreply email:"
      echo '  git config user.email "YOUR_ID+YOUR_USERNAME@users.noreply.github.com"'
      exit 1
    fi

    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git init
      git branch -M main
    fi

    if ! git remote get-url origin >/dev/null 2>&1; then
      git remote add origin "$GITHUB_REMOTE_URL"
    fi

    git add index.html .nojekyll commands.sh data src styles .gitignore

    if git diff --cached --quiet; then
      echo "No local changes to commit. Pushing current main branch."
    else
      git commit -m "${2:-Add Seattle weather interactive visualization}"
    fi

    git branch -M main
    git push -u origin main

    cat <<EOF
Pushed to ${GITHUB_REMOTE_URL}.

Next GitHub Pages steps:
  1. Open the repository on GitHub.
  2. Go to Settings -> Pages.
  3. Choose "Deploy from a branch".
  4. Branch: main; Folder: /root.
EOF
    ;;

  *)
    cat <<'USAGE'
Usage:
  ./commands.sh build                  # 复制静态网页到 dist/
  ./commands.sh localhost              # 启动本地预览: http://127.0.0.1:8000/
  ./commands.sh deploy [commit msg]    # 提交并推送到 GitHub，之后在 Pages 中选择 main /root

Local preview options:
  PORT=9000 ./commands.sh localhost
  HOST=0.0.0.0 ./commands.sh localhost

Deploy options:
  GITHUB_OWNER=your-name GITHUB_REPO=interactive-weather-vis ./commands.sh deploy
  GITHUB_REMOTE_URL=https://github.com/your-name/interactive-weather-vis.git ./commands.sh deploy
USAGE
    ;;
esac
