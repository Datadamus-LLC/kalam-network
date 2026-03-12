---
name: check-docs
description: Check documentation status for an external service before implementing integration code.
argument-hint: "[service-name e.g. tamam-custody, mirsad, hedera-sdk]"
---

# Check Documentation: $ARGUMENTS

Read `.claude/skills/hedera-social-dev/references/documentation-status.md` and report:

1. Is "$ARGUMENTS" listed? What is its status?
2. If DOCUMENTED: show the verified API endpoints/methods available
3. If UNDOCUMENTED:
   - List exactly what information is missing
   - List which tasks are BLOCKED by this
   - Ask the user: "I need the following documentation for $ARGUMENTS before I can proceed: [list specifics]"
4. If NEEDS_VERIFICATION: explain what needs to be verified and ask the user to confirm

NEVER proceed with implementation if the service is UNDOCUMENTED. This is non-negotiable.
