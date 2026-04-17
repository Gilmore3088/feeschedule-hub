#!/usr/bin/env bash
# Phase 62a: Umbrella codegen script.
#
# Sub-tasks:
#   agent-tool-types  Regenerate src/lib/agent-tools/types.generated.ts from
#                     fee_crawler.agent_tools.schemas via pydantic2ts.
#
# Flags:
#   CHECK_MODE=1      Fail (exit 1) if the generated file differs from the
#                     committed version. Used by CI to catch drift.
#
# Usage:
#   bash scripts/codegen.sh                      # defaults to agent-tool-types
#   bash scripts/codegen.sh agent-tool-types     # explicit
#   CHECK_MODE=1 bash scripts/codegen.sh agent-tool-types   # CI drift check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SUB="${1:-agent-tool-types}"

case "$SUB" in
  agent-tool-types)
    bash "$SCRIPT_DIR/gen-agent-tool-types.sh"
    ;;
  *)
    echo "Usage: $0 [agent-tool-types]" >&2
    exit 2
    ;;
esac
