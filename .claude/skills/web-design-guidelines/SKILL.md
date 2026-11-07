---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance (accessibility, focus, forms, motion, hydration, copy). Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the rules in [command.md](command.md) (next to this file)
2. Read the specified files (or ask the user for files/pattern)
3. Check against all rules in `command.md`
4. Output findings in the terse `file:line` format it specifies

## Guidelines Source

The rules are **vendored and pinned** in `command.md` — do **not** fetch them from the network.
Origin: `vercel-labs/web-interface-guidelines` at commit `434b7f9` (2026-10-05), MIT (see `LICENSE`).

Local changes for Colibly (Spanish UI):
- "Title Case for headings/buttons" → sentence case.
- "`&` over and" → always "y" in user-facing text.

To update: copy the new upstream `command.md`, re-apply the two changes above and update the commit here.

## Colibly context

These rules review code; they don't set the look. Colibly's own rules win on conflict:
semantic color tokens only, components from `app/components/ui/`, design system in
`docs/arquitectura/frontend.md`, `docs/COLOR.md` and `docs/TIPOGRAFIA.md`.

## Usage

When a user provides a file or pattern argument:
1. Read `command.md`
2. Read the specified files
3. Apply all rules
4. Output findings using the format specified in `command.md`

If no files are specified, ask the user which files to review.
