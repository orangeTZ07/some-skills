---
name: model-delegation
description: "Orchestrates sub-agent delegation by model tier: GPT-5.5 for exploration, hard reasoning, and final review; GPT-5.4-class models for implementation and work summaries. Use when the user explicitly asks to distribute work to subagents, use multiple model tiers, assign GPT-5.5/GPT-5.4 roles, run an explore-implement-review workflow, or has set a standing preference to use multi-agent workflows proactively."
---

# Model Delegation

## Purpose

Use this skill to split work across subagents without losing ownership of the final result.

Default model roles:

- `gpt-5.5`: architecture exploration, ambiguity reduction, deep reasoning, risk analysis, and final review.
- `gpt-5.4`: bounded implementation, test fixes, mechanical refactors, and worker summaries.
- `gpt-5.3-codex` or `gpt-5.4-mini`: narrow coding or search tasks only when speed/cost matters more than depth.

## Delegation Bias

Be proactive once delegation is authorized. If the user has explicitly asked for subagents, delegation, parallel agents, this model-tier workflow, or a standing preference to use multi-agent workflows, treat that as authorization for the current task and closely related follow-up work in the same session.

Prefer delegating when at least one of these is true:

- Exploration and implementation can proceed independently.
- The task touches multiple files, interaction paths, or regression risks.
- A reviewer can check a concrete diff while the main agent prepares verification.
- A worker can make a bounded patch with a clear write scope while the main agent handles a different critical-path step.

For small tasks, use a lean shape: one explorer or one worker, plus local integration. Do not add agents just to create ceremony.

## Gate

Spawn subagents only when delegation has been authorized by the user, either in the current request or through an explicit standing preference. Depth, complexity, or a request to "think hard" is not enough by itself.

Before spawning:

- State the decomposition in a short TodoList.
- Identify the immediate critical-path task the main agent will do locally.
- Give each subagent a bounded task with clear output.
- Avoid duplicate work. If a worker edits code, assign disjoint files or responsibilities.

## Standard Workflow

1. Main agent defines the target outcome, constraints, and success checks.
2. Spawn `gpt-5.5` explorer for problem framing, architecture options, edge cases, or risk discovery.
3. Spawn one or more `gpt-5.4` workers for implementation, each with a clear write scope.
4. Require each `gpt-5.4` worker summary to include changed files, tests run, unresolved risks, and assumptions.
5. Main agent integrates worker changes and resolves conflicts.
6. Spawn `gpt-5.5` reviewer after integration, passing the final diff and worker summaries.
7. Main agent applies review fixes, runs verification, and gives the final user-facing summary.

## Prompt Patterns

Explorer prompt:

```text
Use gpt-5.5. Explore only; do not edit files. Answer: relevant files/functions, likely failure modes, recommended implementation shape, risks, and verification steps. Keep output concrete with file paths and line references.
```

Worker prompt:

```text
Use gpt-5.4. Implement the assigned slice directly. You are not alone in the codebase; do not revert others' edits. Own only [files/responsibility]. Final answer must list changed files, tests run, assumptions, and remaining risks.
```

Reviewer prompt:

```text
Use gpt-5.5. Review the integrated diff and worker summaries. Prioritize bugs, regressions, missed edge cases, test gaps, and architecture concerns. Do not rewrite; return findings with severity and file/line references.
```

## Guardrails

- Do not hand off the next blocking step if the main agent can do it immediately.
- After authorization, actively look for useful sidecar tasks instead of defaulting to solo execution.
- Do not wait for subagents unless their result is needed for the next critical-path action.
- Do not let two workers edit the same file unless the write scopes are explicitly non-overlapping and easy to merge.
- Prefer one explorer plus one worker over many agents when the task is small.
- Keep final authority local: the main agent owns integration, verification, and final response.

## Summary Format

When reporting back to the user:

- Mention which model tiers were used and for what.
- Summarize the implementation outcome, not every intermediate agent detail.
- Include verification commands and results.
- Call out any files already dirty before the work that were not touched.
