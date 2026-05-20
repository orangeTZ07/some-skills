---
name: chaoxing-todo
description: Find unfinished homework, active tasks, quizzes, and chapter task points in Chaoxing/学习通 and similar LMS/course platforms using browser automation. Use when the user asks to check course todos, unsubmitted assignments, incomplete tasks, chapter progress, learning platform deadlines, or make a privacy-safe to-do list across courses.
---

# Chaoxing Todo

## Goal

Find course to-dos quickly with browser automation while minimizing tokens and hiding user privacy. Chaoxing/学习通 is the primary adapter; use the generic LMS heuristics for Moodle, Canvas, Blackboard-style portals, or unknown course systems.

## Environment First

1. Confirm browser automation works before logging in or scanning:
   - In Codex, call `mcp__chromium__.browser_tabs {"action":"list"}`.
   - In other agents, use the available Playwright/browser session list or open a blank page.
2. If the browser tool reports `Transport closed`, CDP refusal, or no browser context, fix/restart that automation layer first.
3. Keep the same browser profile/session to preserve cookies.
4. If login is required, ask the user to log in or provide credentials. Never repeat passwords, SMS codes, cookies, or tokens in summaries.
5. Prefer DOM extraction from pages and iframes. Avoid long snapshots except for manual verification of ambiguous results.

## Privacy Rules

Default to privacy-safe output:

- Do not print phone numbers, student IDs, cookies, tokens, `enc`, `cpi`, `clazzid`, `courseid`, full URLs, or profile names unless the user explicitly asks.
- Redact identifiers in tool-derived records before final reporting.
- Keep only course title, task title, status, deadline/remaining time, and completion ratio.
- If a task title itself contains personal data, replace that portion with `[redacted]`.

## Fast Chaoxing Workflow

1. Open `https://i.chaoxing.com/`.
2. Extract open course links from the course iframe; skip blocks containing `Course has closed`.
3. For each course, open the `stucoursemiddle` link and scan only:
   - `作业`: ratio like `7/8`; titles near `To be Submitted`, `未提交`, `待提交`, `Uncompleted`, `未交`; `answerId=0` if opening a detail page.
   - `任务`: active list items such as `<li activestatus="1">` and text containing `Remaining`.
   - `章节`: `Tasks Completed: x/y`; `.chapter_item` with a task count but no `.icon_yiwanc`.
4. Batch 3-5 courses per browser script run to avoid 120s tool timeouts.
5. Manually re-check only noisy cases, e.g. `作业 7/8` but no captured title.

## Generic LMS Workflow

When not on Chaoxing:

1. Locate course cards/links from the dashboard using anchors whose surrounding text includes course names.
2. For each course, inspect likely tabs/links by visible text:
   - Assignments/Homework/作业
   - Tasks/Activities/任务
   - Grades/Progress/学习进度
   - Modules/Chapters/章节
   - Quizzes/Tests/考试/测验
3. Extract items matching unfinished states:
   - English: `not submitted`, `unsubmitted`, `missing`, `todo`, `due`, `available until`, `in progress`, `not completed`
   - Chinese: `未提交`, `待提交`, `未完成`, `进行中`, `剩余`, `截止`, `待完成`
4. Treat module/chapter task points as homework when the user says so. Otherwise label them separately as chapter task points.

## Script

Use `scripts/lms_todo_scan_snippet.js` as a starting point for `browser_run_code_unsafe`. It returns redacted structured results. Tune `maxCourses`, selectors, or `platform` as needed.

## Output

Prefer compact Chinese output:

```text
明确作业/任务待提交
- 课程：事项，状态/剩余时间

章节/任务点未完成
- 课程：Tasks Completed x/y
  - 具体未完成项...

未看到明显待办
- 课程：证据，如 作业 6/6、章节 128/128
```

For very large `0/N` courses, report the ratio and representative sections first. Expand all items only if the user asks.

## Status Heuristics

- Todo: `To be Submitted`, `未提交`, `待提交`, `Uncompleted`, `未交`, `answerId=0`, `activestatus="1"`, `Remaining`.
- Usually not todo: `To be marked`, `Completed`, `reviewd`, `Analysis`, completed ratios.
- Chapter incomplete: visible task count plus no completion marker such as `.icon_yiwanc`.
- Trust live runtime DOM over static source or stale labels.
