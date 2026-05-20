#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="all"

usage() {
  cat <<'EOF'
Install skills from this repository for one or more local agents.

Usage:
  ./install.sh
  ./install.sh --skill chaoxing-todo
  ./install.sh --skill obsidian-learner
  ./install.sh --skill all
  ./install.sh --agent codex
  ./install.sh --agent gemini
  ./install.sh --agent claude
  ./install.sh --agent project
  ./install.sh --agent all
  ./install.sh --target /path/to/skills
  ./install.sh --agent codex --force

Agents:
  codex    -> ${CODEX_HOME:-$HOME/.codex}/skills
  gemini   -> ${GEMINI_HOME:-$HOME/.gemini}/skills
  claude   -> ${CLAUDE_HOME:-$HOME/.claude}/skills
  project  -> ./ .agents/skills
  custom   -> prompt for a target skills directory
  all      -> codex, gemini, claude, project

Options:
  --agent NAME     Agent target to install for.
  --skill NAME     Skill directory to install, or "all" for every skill.
  --target DIR     Install into a custom skills parent directory.
  --force          Replace existing install after backing it up.
  --skills         List installable skills and exit.
  --list           Print known targets and exit.
  -h, --help       Show this help.
EOF
}

target_for_agent() {
  case "$1" in
    codex) printf '%s\n' "${CODEX_HOME:-"$HOME/.codex"}/skills" ;;
    gemini) printf '%s\n' "${GEMINI_HOME:-"$HOME/.gemini"}/skills" ;;
    claude) printf '%s\n' "${CLAUDE_HOME:-"$HOME/.claude"}/skills" ;;
    project) printf '%s\n' "${SCRIPT_DIR}/.agents/skills" ;;
    *) return 1 ;;
  esac
}

list_targets() {
  printf 'codex   %s\n' "$(target_for_agent codex)"
  printf 'gemini  %s\n' "$(target_for_agent gemini)"
  printf 'claude  %s\n' "$(target_for_agent claude)"
  printf 'project %s\n' "$(target_for_agent project)"
}

list_skills() {
  local found=0
  local dir
  for dir in "${SCRIPT_DIR}"/*; do
    [[ -f "${dir}/SKILL.md" ]] || continue
    printf '%s\n' "$(basename "$dir")"
    found=1
  done
  [[ "$found" == "1" ]]
}

copy_one_skill() {
  local target_parent="$1"
  local skill_name="$2"
  local source_dir="${SCRIPT_DIR}/${skill_name}"
  local destination="${target_parent}/${skill_name}"
  local stamp backup

  if [[ ! -f "${source_dir}/SKILL.md" ]]; then
    printf 'Failure: skill source not found: %s\n' "$source_dir" >&2
    exit 1
  fi

  mkdir -p "$target_parent"

  if [[ -e "$destination" ]]; then
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup="${destination}.bak-${stamp}"
    if [[ "$FORCE" != "1" ]]; then
      printf 'Skip: %s already exists. Re-run with --force to back it up and replace it.\n' "$destination"
      return 0
    fi
    mv "$destination" "$backup"
    printf 'Backup: %s -> %s\n' "$destination" "$backup"
  fi

  cp -R "$source_dir" "$destination"
  find "${destination}/scripts" -maxdepth 1 -type f \( -name '*.cjs' -o -name '*.js' -o -name '*.sh' \) -exec chmod +x {} \; 2>/dev/null || true
  printf 'Installed: %s\n' "$destination"
}

copy_skill() {
  local target_parent="$1"
  local skill

  if [[ "$SKILL_NAME" == "all" ]]; then
    while IFS= read -r skill; do
      copy_one_skill "$target_parent" "$skill"
    done < <(list_skills)
  else
    copy_one_skill "$target_parent" "$SKILL_NAME"
  fi
}

prompt_agent() {
  cat <<'EOF'
Choose install target:
  1) Codex
  2) Gemini CLI
  3) Claude
  4) Project-local .agents/skills
  5) Custom skills directory
  6) All known targets
EOF
  printf 'Enter choice [1-6]: '
  read -r choice
  case "$choice" in
    1) printf 'codex\n' ;;
    2) printf 'gemini\n' ;;
    3) printf 'claude\n' ;;
    4) printf 'project\n' ;;
    5) printf 'custom\n' ;;
    6) printf 'all\n' ;;
    *) printf 'Failure: invalid choice\n' >&2; exit 1 ;;
  esac
}

AGENT=""
CUSTOM_TARGET=""
FORCE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill)
      SKILL_NAME="${2:-}"
      shift 2
      ;;
    --agent)
      AGENT="${2:-}"
      shift 2
      ;;
    --target)
      CUSTOM_TARGET="${2:-}"
      AGENT="custom"
      shift 2
      ;;
    --force)
      FORCE="1"
      shift
      ;;
    --skills)
      list_skills
      exit 0
      ;;
    --list)
      list_targets
      exit 0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Failure: unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$AGENT" ]]; then
  AGENT="$(prompt_agent)"
fi

case "$AGENT" in
  codex|gemini|claude|project)
    copy_skill "$(target_for_agent "$AGENT")"
    ;;
  custom)
    if [[ -z "$CUSTOM_TARGET" ]]; then
      printf 'Enter target skills directory: '
      read -r CUSTOM_TARGET
    fi
    if [[ -z "$CUSTOM_TARGET" ]]; then
      printf 'Failure: empty target directory\n' >&2
      exit 1
    fi
    copy_skill "$CUSTOM_TARGET"
    ;;
  all)
    copy_skill "$(target_for_agent codex)"
    copy_skill "$(target_for_agent gemini)"
    copy_skill "$(target_for_agent claude)"
    copy_skill "$(target_for_agent project)"
    ;;
  *)
    printf 'Failure: unknown agent: %s\n' "$AGENT" >&2
    usage >&2
    exit 1
    ;;
esac
