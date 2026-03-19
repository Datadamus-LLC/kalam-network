# Browser QA State — Full Coverage Run 2026-03-19

> **Folder**: qa-screenshots/run-2026-03-19/
> **Users**: test-individual@test.hedera.social / test-org@test.hedera.social (OTP: 123123)
> **Method**: Real browser — click every button, fill every input, screenshot every action.
> **Status**: IN PROGRESS
> **Screenshots start at**: QA-52

---

## Progress Checklist

### AUTH
- [ ] Landing page loads
- [ ] Login — email input, OTP input, submit → feed
- [ ] Logout

### FEED
- [ ] For You tab loads with posts
- [ ] Trending tab
- [ ] Following tab
- [ ] Compose post — type text, character counter, submit
- [ ] Like a post
- [ ] Unlike a post
- [ ] Open post comments
- [ ] Add a comment
- [ ] Delete own comment
- [ ] Delete own post

### DISCOVER
- [ ] Page loads with search + trending
- [ ] Search by name — results appear
- [ ] Follow button works
- [ ] Click user → goes to their profile

### PROFILE
- [ ] Own profile page (profile/me)
- [ ] Other user profile
- [ ] Follow/unfollow from profile
- [ ] Tabs: Posts / Replies / Payments

### MESSAGES
- [ ] Messages list loads
- [ ] New conversation dialog opens
- [ ] Search in new conversation dialog
- [ ] Create new conversation
- [ ] Open existing conversation
- [ ] Send a message
- [ ] Message appears with timestamp
- [ ] Leave conversation button

### NOTIFICATIONS
- [ ] All tab loads
- [ ] Messages tab filter
- [ ] Payments tab filter
- [ ] Social tab filter
- [ ] System tab filter
- [ ] Mark all read button
- [ ] Select individual notification
- [ ] Preferences toggles (all 4)

### PAYMENTS
- [ ] Page loads with balance
- [ ] All tab
- [ ] Sent tab filter
- [ ] Received tab filter
- [ ] Search transactions field
- [ ] Filters button
- [ ] Refresh balance button
- [ ] Refresh transactions button
- [ ] Send modal — opens
- [ ] Send modal — currency shows TMUSD
- [ ] Send modal — enter recipient
- [ ] Send modal — enter amount
- [ ] Send modal — enter note
- [ ] Send modal — Review button enabled
- [ ] Send modal — review step shows correct details
- [ ] Send modal — Cancel
- [ ] Request modal — opens
- [ ] Request modal — enter details
- [ ] Request modal — submit
- [ ] Split modal — opens
- [ ] Split modal — add participant
- [ ] Split modal — remove participant
- [ ] Split modal — cancel
- [ ] Click transaction → detail view
- [ ] Recent Contacts — Send button

### BROADCASTS
- [ ] Page loads without error
- [ ] Subscribe to channel input
- [ ] Subscribe button enables on input
- [ ] Refresh button
- [ ] Right panel stats

### SETTINGS — PROFILE TAB
- [ ] Display name field pre-populated
- [ ] Username field present with @ prefix
- [ ] Username availability check (type username → green "Available")
- [ ] Bio field
- [ ] Avatar URL field
- [ ] Save Changes button
- [ ] Success toast on save

### SETTINGS — ACCOUNT TAB
- [ ] Account info visible

### SETTINGS — WALLET & ENCRYPTION TAB
- [ ] Wallet info visible
- [ ] Set PIN button or form
- [ ] Encryption key status

### SETTINGS — APPEARANCE TAB
- [ ] Dark/Light mode toggle works

### SETTINGS — DANGER ZONE TAB
- [ ] Delete account section visible

### ORGANIZATION (individual user)
- [ ] Organization page shows Create form
- [ ] Name input
- [ ] Create Organization button (disabled when empty)

### MOBILE — 375px width
- [ ] Landing page mobile
- [ ] Feed mobile
- [ ] Hamburger menu opens
- [ ] Nav items visible in menu
- [ ] Payments mobile

### ORG USER (test-org@test.hedera.social)
- [ ] Login as org user
- [ ] Organization nav link in sidebar
- [ ] Org page loads with org dashboard
- [ ] Back to Feed link visible
- [ ] Overview / Members / Broadcasts / Settings tabs
- [ ] Members tab
- [ ] Broadcasts tab links to /broadcasts
- [ ] Org Settings tab
- [ ] Logout org user

---

## Bugs Found

| # | Severity | Screen | Description | Fixed? |
|---|----------|--------|-------------|--------|

---

## Next Session
- Status: STARTING FRESH (QA-52)
- Logged in as: test-individual@test.hedera.social
