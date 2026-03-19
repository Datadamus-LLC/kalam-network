---
name: browser-qa
description: "Start or resume the manual browser QA session for Hedera Social. Tests every screen, every button, every interaction. Fixes bugs found. Tracks state across sessions."
---

# Browser QA Session

You are resuming (or starting) the manual browser QA for Hedera Social.

## FIRST: Load the skill
Read `.claude/skills/browser-qa/SKILL.md` and follow it exactly.

## THEN: Read the state file
Read `.claude/state/browser-qa-state.md` to understand:
- Where the last session ended
- What has been tested
- What bugs were found and fixed
- What's still unchecked

## RESUME FROM WHERE WE LEFT OFF

Find the "Next Session: WHERE TO RESUME" section in the state file and start there.
Do NOT re-test things already marked with [x] unless they need re-verification after a fix.

## IMPORTANT REMINDERS

- Screenshot EVERY action (before and after)
- Only click buttons/links — never change URL directly
- Fix bugs immediately when found
- Update the state file as you go
- Don't come back until 100% coverage OR you need specific info from the user

## CONTEXT LIMIT

When you're at ~15MB, update the state file with your exact position and stop.
The next `/browser-qa` invocation will read the state and continue.
