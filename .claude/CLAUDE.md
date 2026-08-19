# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Never state a guess as a fact. Mark it clearly as a guess, proposal, or question (e.g. "this might be...", "does this match your understanding?").
- If you don't know something, say so plainly. Silence about unknowns is worse than the unknown itself — unresolved gaps compound unnoticed until they surface as bigger problems.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Suspect Your Own Artifact First

**When a result contradicts what you expected, audit your own code/logic before blaming the user's environment.**

- Don't reflexively attribute a wrong result to stale files, failed transfers, caching, or "did you re-run it?" Reconcile the evidence already in hand against YOUR code, end to end, first.
- Treat the user's observations as ground truth. If they say "X matches," fit your logic to that fact — don't re-ask them to verify the same thing.
- Batch uncertainty into one round trip: finish the self-audit, then return with "root cause + minimal fix" together. Avoid drip-feeding diagnostic questions.
- For one-shot/throwaway scripts, build in self-diagnosing output (dump the candidate rows, print match counts, warn loudly on zero matches) so a single run reveals the cause and round trips drop to zero.

## 6. Keep Business Domain Out of Shared Config

**`/home/igpf-2500009/.claude/{CLAUDE.md, commands, skills}` is a symlink into a shared dotfiles repo. Anything written there gets pushed.**

When writing or editing a skill, slash command, or CLAUDE.md section:

- Never write customer/project/product/repository names, table or column names, API field names, hostnames, endpoints, environment names, or internal org nouns.
- Test: replace the proper noun with `<placeholder>`. If the text still carries its value, keep it in the shared file with the placeholder. If the proper noun *was* the information, move it out.
- Move it to `/home/igpf-2500009/.claude/local/<area>/RULES.md` (outside the symlinked dirs, git-ignored) or the target project's own `.claude/`. Leave only an optional reference behind: read it if it exists, continue silently if it doesn't.
- Before committing: `grep -rniEf /home/igpf-2500009/.claude/local/ngwords.txt .claude/`

Full rule: the dotfiles README section「共有する範囲 — 業務ドメインを混入させない」.

---
## Additional Rules

- Never execute `sudo` (or any command requiring elevated/interactive password auth) directly. Only propose the exact command for the user to run themselves — they will judge and execute it.
- When summarizing another file's content into a transient working doc (e.g. a plan/todo/coordination note) so the reader can act without opening it, limit each entry to conclusion + open question + source path — don't copy in diagrams or alternative-comparison tables. This does NOT apply to instructions that route someone (or a subagent) to material they must read anyway, nor to permanent spec/reference documents where full context belongs.
- Preserve existing architecture unless explicitly requested.
- Ask before introducing new dependencies.
- Do not change public API behavior unless required by the task.
- Always explain verification steps after implementation.

---
**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
