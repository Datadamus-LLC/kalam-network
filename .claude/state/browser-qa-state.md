# Browser QA State — Run 2026-03-18 (Session 2 — Full Re-test)

> **Folder**: qa-screenshots/
> **Users**: test-individual@test.hedera.social / test-org@test.hedera.social (OTP: 123123)
> **Method**: Real browser — click every button, fill every input, screenshot every action.
> **Status**: IN PROGRESS

---

## Session: 2026-03-18 (Session 2)

### Servers
- API: ?
- Frontend: ?

---

## Progress Checklist

### AUTH
- [ ] Landing page loads
- [ ] Login — email input, OTP input, submit → feed
- [ ] Logout

### FEED
- [ ] For You tab loads
- [ ] Trending tab
- [ ] Following tab
- [ ] Compose post — type text, counter, submit
- [ ] Like a post
- [ ] Unlike a post
- [ ] Open comments
- [ ] Add a comment
- [ ] Delete own comment
- [ ] Delete own post

### DISCOVER
- [ ] Page loads
- [ ] Search by name
- [ ] Follow button in results
- [ ] Click user → profile

### PROFILE
- [ ] Own profile page
- [ ] Other user profile
- [ ] Follow/unfollow

### MESSAGES
- [ ] Messages list loads
- [ ] New conversation dialog
- [ ] Create conversation
- [ ] Conversation in list
- [ ] Open conversation → chat
- [ ] Send a message — text appears, timestamp
- [ ] Send another message — both visible
- [ ] Messages do NOT disappear after sending

### NOTIFICATIONS
- [ ] Notification list loads
- [ ] Category filter tabs (All/Messages/Payments/Social/System)
- [ ] Preferences toggles

### PAYMENTS — FULL COVERAGE
- [ ] Page loads, balance shown
- [ ] Transaction history list (empty state)
- [ ] Sent/Received/All tabs
- [ ] **Send TMUSD modal** — opens, shows TMUSD (not HBAR), no currency dropdown
- [ ] Send form — enter amount, note, recipient
- [ ] Send review step — confirm shows TMUSD
- [ ] Send confirm button
- [ ] **Request payment modal** — opens, shows TMUSD
- [ ] Request form — amount, description
- [ ] Request submit
- [ ] **Split payment modal** — opens, shows TMUSD
- [ ] Split — add participant (type account ID, click +)
- [ ] Split — remove participant
- [ ] Split — equal split shows per-person amount
- [ ] Split — custom amounts mode
- [ ] Split — review step
- [ ] Split — submit

### BROADCASTS
- [ ] Page loads (no error, no "Validation failed")
- [ ] Subscribe form visible
- [ ] Enter topic ID, subscribe button

### SETTINGS
- [ ] Profile tab — all fields, save
- [ ] Account tab
- [ ] Wallet & Encryption tab
- [ ] Appearance tab — dark/light toggle
- [ ] Danger Zone tab

### MOBILE (375px)
- [ ] Landing page
- [ ] Feed
- [ ] Sidebar hamburger

### ORG USER (test-org@test.hedera.social)
- [ ] Login as org
- [ ] Organization nav link visible
- [ ] Organization page loads

---

## Bugs Found

| # | Severity | Screen | Description | Fixed? |
|---|----------|--------|-------------|--------|

---

## Next Session
- Status: IN PROGRESS
- Last screenshot: QA-46 (from previous session)
