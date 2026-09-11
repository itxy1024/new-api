#!/usr/bin/env bash

# 为 fork 构建生成可展示、可比较且不会误报的版本号。
set -euo pipefail

short_sha="$(git rev-parse --short=7 HEAD 2>/dev/null || printf 'unknown')"

# 显式传入的 VERSION 优先，例如发布工作流从 tag 构建时的版本。
if [[ -n "${VERSION:-}" && "${VERSION}" != "v0.0.0" ]]; then
  printf '%s\n' "${VERSION}"
  exit 0
fi

official_tag=""
latest_tag=""

# 只把确实位于当前提交历史中的官方 Release 作为比较基线，避免 fork
# 落后于官方时却被错误地标记为最新版本。
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  latest_tag="$(curl --fail --silent --show-error --location \
    --connect-timeout 5 --max-time 15 \
    'https://api.github.com/repos/QuantumNous/new-api/releases?per_page=20' \
    | jq -r '[.[] | select(.draft == false and (.tag_name | test("^v[0-9]+\\.[0-9]+\\.[0-9]+")))] | .[0].tag_name // empty' \
    || true)"
  if [[ -n "$latest_tag" ]]; then
    git fetch --quiet --no-tags --depth=1 \
      'https://github.com/QuantumNous/new-api.git' \
      "refs/tags/${latest_tag}:refs/tags/${latest_tag}" || true
    if git rev-parse --verify --quiet "${latest_tag}^{commit}" >/dev/null \
      && git merge-base --is-ancestor "${latest_tag}^{commit}" HEAD; then
      official_tag="$latest_tag"
    fi
  fi
fi

if [[ -n "$official_tag" ]]; then
  printf '%s\n' "${official_tag}+fork.${short_sha}"
else
  printf '%s\n' "fork.${short_sha}"
fi
