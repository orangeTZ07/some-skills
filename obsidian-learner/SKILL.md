---
name: obsidian-learner
description: Turn an AI conversation, troubleshooting session, learning thread, or terminal/code investigation into an Obsidian-ready Markdown note plus a Canvas graph update by default. Use when the user explicitly asks to save, summarize, archive, distill, or "沉淀" current context into an Obsidian vault; when creating notes with frontmatter, tags, glossary terms, [待验证] markers, or .canvas links; or when maintaining an Obsidian knowledge base from chat history.
---

# Obsidian Learner

## Overview

Convert the current working context into a durable Obsidian knowledge artifact: one Markdown note, glossary updates when useful, and a Canvas node/link update by default. Prefer explicit user intent over automatic triggering; do not silently write into a vault.

## Workflow

1. Confirm the target vault only if it is ambiguous. Read `~/.config/obsidian-learner/config.json` when present; otherwise ask for a vault path and optionally create the config.
2. Load or initialize style preferences from `<vault>/.obsidian-learner/style_profile.json`. If missing, ask a short questionnaire before writing the first note.
3. Synthesize the note from the current conversation, terminal outputs, and relevant local files the user referenced. Do not invent facts to fill gaps.
4. Choose the destination folder conservatively. Use the user's requested folder when given; otherwise use `Notes/` or a clearly matching top-level topic folder. Do not place notes into semantically reserved folders such as `src/`, `ctf/`, `machine_learning/`, project source trees, or imported vault subtrees unless the user explicitly asks for that location.
5. Write a Markdown note with frontmatter, a stable structure, tags, and `[待验证]` markers for uncertain details.
6. Update `<vault>/.obsidian-learner/glossary.json` only for useful terms introduced by the new note.
7. Update an Obsidian `.canvas` file by linking the new note to existing notes with overlapping tags or title keywords, unless the user explicitly says not to maintain Canvas or the vault has no appropriate Canvas target and creating one would be inappropriate.
8. Report the created paths, new glossary terms, Canvas links, and verification items.

## Configuration

Use XDG-style config rather than model-provider-specific paths:

```json
{
  "vaults": [
    {
      "name": "MyKnowledge",
      "path": "/absolute/path/to/ObsidianVault",
      "default": true
    }
  ],
  "auto_commit": false
}
```

Default location: `~/.config/obsidian-learner/config.json`.

Vault-local state:

- `<vault>/.obsidian-learner/style_profile.json`
- `<vault>/.obsidian-learner/glossary.json`

Style profile fields:

```json
{
  "top_heading_level": 2,
  "step_verbosity": "detailed",
  "code_block_lang_required": true,
  "tag_location": "frontmatter",
  "use_callouts": true
}
```

If the profile is missing, ask at most these five questions: top heading level, step verbosity, code block language labels, tag location, and Obsidian callout preference. Do not infer style by scanning unrelated notes unless the user asks for that.

## Operational Strategies (Handling Obstacles)

### 1. Filesystem Permissions & Workspace Constraints
- **Limitation**: The `write_file` tool can only write within approved workspace directories.
- **Strategy**: When target vault is outside the current workspace:
    1. Write the content to the **project temporary directory** first using `write_file`.
    2. Use `run_shell_command` with `mv` or `cp` to relocate it to the final vault destination.
    3. Ensure target directories exist via `mkdir -p`.

### 2. Reliable Content Writing (Shell Escaping)
- **Limitation**: Long, multiline content in `run_shell_command` (like `cat << EOF`) can fail if nested braces `{}` or backticks are misunderstood by the shell.
- **Strategy**: 
    - Prefer writing to a temp file via `write_file` (which handles text safely) over complex heredocs.
    - **Crucial for JSON/Canvas**: Use `printf` with single quotes to generate JSON. Ensure all internal newlines are explicitly escaped as `\\n`. This prevents the shell or the JSON parser from breaking on raw newline characters.

### 3. Path Pre-verification & Diagnostics
- **Strategy**: Before performing any destructive or multi-step directory operation, run a single "diagnostic command" to gather all required context.
- **Example Command**: `[ -d "$TARGET_DIR" ] && echo "EXISTS" && ls -A "$TARGET_DIR" || (echo "MISSING" && find "$(dirname "$TARGET_DIR")" -maxdepth 1)`
- This approach avoids "file not found" errors mid-workflow and provides immediate fallback options for fuzzy matching.

### 4. Fuzzy Path Matching
- **Limitation**: Users may provide slightly incorrect paths (e.g., typos or wrong directory depth).
- **Strategy**: 
    - If a provided path fails, use `find` or `ls` with glob patterns (e.g., `find ~/work -name "*repo-name*"`) to search for the intended directory.
    - Proactively suggest the most likely match to the user before proceeding or failing.

## Note Contract

Create notes with this skeleton unless the user requests another structure:

```markdown
---
title: "..."
date: "YYYY-MM-DD"
tags: [tag-a, tag-b]
source: conversation
---

## 问题背景

## 解决过程

## 核心结论

## 延伸思考

## 待验证
```

Rules:

- Extract 2-5 tags from the actual content.
- Preserve command outputs, paths, versions, and error messages precisely when they matter.
- Mark uncertain or environment-dependent claims with `[待验证]`; collect them again in `## 待验证`.
- Keep failed attempts if they explain the final solution.
- Prefer concise, reusable knowledge over transcript-style summaries.
- Use the user's configured heading, callout, and code block preferences.
- Keep destination folders meaningful: troubleshooting and operations notes belong in general knowledge/topic folders such as `Notes/`, `network/`, `linux/`, or another explicit user-selected folder, not in directories whose local convention indicates source-code study, CTF notes, ML notes, or imported sub-vault content.

## Glossary

Maintain `<vault>/.obsidian-learner/glossary.json` as a simple object keyed by term:

```json
{
  "term": {
    "definition": "short explanation",
    "first_seen": "relative/path/to/note.md"
  }
}
```

Add terms only when they help future reading: command flags, acronyms, tool names, protocol names, and domain-specific concepts. Avoid explaining common words. If a definition is uncertain, either mark it `[待验证]` in the note or skip the glossary update.

## Canvas Update

Default behavior: maintain a Canvas graph for each new knowledge note unless the user explicitly declines Canvas. Use a user-specified Canvas when provided; otherwise prefer an existing top-level knowledge Canvas such as `Knowledge.canvas`, and create `Knowledge.canvas` when no suitable Canvas exists.

When updating a Canvas:

- Use Obsidian Canvas JSON with `nodes` and `edges`.
- Add the new note as a `file` node.
- Link to up to 5 existing Markdown notes ranked by shared tags first, then title keywords.
- Preserve existing node positions and edges.
- Place the new node to the right of the existing graph.
- If the target `.canvas` file is malformed, copy it to `.bak` before replacing it.

## Helper Script

Use `scripts/obsidian_learner_tools.cjs` for deterministic file operations:

```bash
node scripts/obsidian_learner_tools.cjs write-note --vault /path/to/vault --title "Title" --tags "linux,shell" --body /tmp/body.md
node scripts/obsidian_learner_tools.cjs update-canvas --vault /path/to/vault --note "Notes/title.md" --canvas "Knowledge.canvas"
node scripts/obsidian_learner_tools.cjs init-profile --vault /path/to/vault
```

The script performs atomic writes, slug generation, frontmatter tag parsing, and Canvas append/link logic. Generate the Markdown body yourself; do not outsource reasoning or factual synthesis to the script.

## Git Handling

If `auto_commit: true`, run `git status` first and avoid touching unrelated changes. Commit only the note, Canvas file, and glossary/profile files created or modified for this run. Commit message format:

```text
note(learner): <note title> [auto]
```

Never run `git push` automatically.

## Non-Goals

- Do not implement automatic keyword listeners.
- Do not use self-play simulation to invent missing details.
- Do not perform vector semantic search in v1.
- Do not scan and rewrite the whole vault.
- Do not overwrite existing Canvas layout.
- Do not hide uncertainty; surface it with `[待验证]`.
