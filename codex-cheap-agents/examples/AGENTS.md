# Cheap Agents routing

For ordinary repository search, investigation, implementation, test repair, and routine refactoring, call `cheap_task` first. Do not pre-read a large set of files merely to prepare that call.

For a diagnosis that must not modify code, call `cheap_investigate`.

For review of the active workspace diff, call `cheap_review`.

The tools store full model output, diff, search material, and logs in task artifacts. Do not repeat completed third-party investigation or request these artifacts unless the compact result says `needs_sol: true`. Deeply intervene only for an escalation, a major decision, or a failed verification.
