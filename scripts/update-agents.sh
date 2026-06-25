#!/usr/bin/env bash
set -euo pipefail

# Kiki Agent Updater — no npm required
# Downloads the latest agent definitions directly from the kiki GitHub repo
#
# Usage:
#   cd /path/to/your/project
#   bash /path/to/kiki/scripts/update-agents.sh
#   # or via curl:
#   curl -sL https://raw.githubusercontent.com/luxuxorg/kiki/main/scripts/update-agents.sh | bash

REPO_RAW="https://raw.githubusercontent.com/luxuxorg/kiki/main"
AGENTS=(
  kiki-orchestrator.md
  kiki-brainstormer.md
  kiki-planner.md
  kiki-implementer.md
  kiki-reviewer.md
  kiki-escalation.md
  kiki-historian.md
)

if [[ ! -d ".opencode/agents" ]]; then
  echo "Error: .opencode/agents/ not found. Are you in a kiki-initialized project?"
  echo "Run 'kiki init' first, or run this from your project root."
  exit 1
fi

echo "Updating kiki agents from ${REPO_RAW} ..."

for agent in "${AGENTS[@]}"; do
  url="${REPO_RAW}/.opencode/agents/${agent}"
  dest=".opencode/agents/${agent}"
  echo "  → ${agent}"
  curl -fsSL "${url}" -o "${dest}.tmp" && mv "${dest}.tmp" "${dest}"
done

# Also update the plugin
echo "  → kiki.ts (plugin)"
curl -fsSL "${REPO_RAW}/.opencode/plugins/kiki.ts" -o ".opencode/plugins/kiki.ts.tmp" && mv ".opencode/plugins/kiki.ts.tmp" ".opencode/plugins/kiki.ts"

echo "Done. Agents updated."

# Warn about decisions path migration
if [[ -f ".opencode/docs/decisions.md" && ! -f "docs/DECISIONS.md" ]]; then
  echo ""
  echo "Note: Historian decisions path has changed."
  echo "  Old: .opencode/docs/decisions.md"
  echo "  New: docs/DECISIONS.md"
  echo "You may want to move your existing decisions file:"
  echo "  mkdir -p docs && mv .opencode/docs/decisions.md docs/DECISIONS.md"
fi
