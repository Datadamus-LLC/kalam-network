# Task P0-T28: Demo Video Recording

| Field | Value |
|-------|-------|
| Task ID | P0-T28 |
| Priority | High |
| Estimated Time | 3 hours |
| Depends On | P0-T25 (Demo Data), P0-T27 (Pitch Deck) |
| Phase | 6 — Hackathon Submission |
| Assignee | Junior Developer (Video Production) |

---

## Objective

Record a 4-5 minute walkthrough video that showcases HederaSocial's features and demonstrates the full user flow. This video serves as:
- Backup if live demo fails during presentation
- YouTube/social media clip for marketing
- Reference for judges if they review remotely
- Proof that all features work correctly

The video should be engaging, clear, and tell a compelling story about what HederaSocial enables.

## Background

A great demo video:
- Hooks viewers in first 5 seconds
- Shows real app usage (not mockups or slides)
- Explains what's happening with clear narration
- Demonstrates value clearly
- Has good audio and video quality
- Doesn't ramble or go off track
- Ends with call to action

The video will likely be watched by:
- Hackathon judges (if live demo fails)
- Hedera ecosystem members
- Potential users and investors
- Media / influencers

## Pre-requisites

Before starting this task, ensure:

1. **Demo Environment Ready**
   - App running locally (or deployed to live server)
   - Seed data populated (3 demo users)
   - All features working smoothly
   - No errors or loading issues

2. **Recording Equipment**
   - Decent microphone (built-in laptop mic is OK)
   - Screen recording software (OBS Studio - free, or Loom)
   - Quiet recording environment (no background noise)

3. **Preparation**
   - Script written and rehearsed
   - Screenshots prepared as backup
   - Video editing software available (optional)
   - Test recording done

4. **Browser Setup**
   - Notifications disabled
   - Unnecessary tabs closed
   - Zoom to 100% or 125% (readable)
   - High resolution (1080p minimum)

## Step-by-Step Instructions

### Step 1: Write Video Script

Create file: `scripts/demo-video-script.md`

```markdown
# HederaSocial Demo Video Script (4:45)

## [0:00-0:10] INTRO (10 seconds)

**Voiceover:**
"Tired of centralized social networks that spy on you? Meet HederaSocial. We're building a social platform powered by your Hedera wallet—no passwords, built-in payments, and cryptographic proof of everything you do."

**Visual:**
- Title card with HederaSocial logo
- Quick montage of app screens (2-3 seconds)
- Transition to login screen

---

## [0:10-0:35] AUTHENTICATION (25 seconds)

**Script:**
"Getting started is simple. We use your Hedera wallet as your identity. No passwords to remember, no accounts to compromise. You just connect your wallet and you're in."

**Action:**
1. Show empty login screen
2. Click "Connect Wallet" button
3. Paste test account ID
4. Flash to authenticated home screen
5. Show dashboard with messages and balance

**Key Message:**
- Wallet = Identity
- 10-second setup
- No passwords

---

## [0:35-1:15] MESSAGING (40 seconds)

**Script:**
"Now let's chat. Here's a conversation with Bob. We can send messages, attach files, and there's even voice and video call buttons coming soon. All messages are encrypted and stored on Hedera for privacy and proof."

**Action:**
1. Click on conversation with Bob
2. Show message history
3. Type new message: "Hey Bob, check out this platform!"
4. Send message, show it appear in real-time
5. Bob's reply appears (auto-generated from seed data)
6. Show attachment upload area
7. Zoom in on timestamp and HCS message ID in details panel

**Key Message:**
- Encrypted conversations
- Real-time delivery
- Message integrity on HCS

---

## [1:15-2:15] IN-CHAT PAYMENT (60 seconds)

**Script:**
"Here's where it gets really cool. I can send money directly in this chat. No separate payment app. No intermediary. Just direct peer-to-peer transfers on Hedera."

**Action:**
1. Look for payment button (💰) in chat input
2. Click "Send Money" button
3. Modal opens: enter amount $50, currency USD, optional note
4. Show it calculates instantly, no fees shown
5. Click "Review"
6. Show confirmation screen:
   - Recipient: Bob
   - Amount: $50 USD
   - Network: Hedera Testnet
   - "Confirm & Send" button
7. Click send
8. Show success message with transaction hash
9. Payment appears in chat as a receipt card showing:
   - Amount, recipient, timestamp
   - Status: "Confirmed"
   - Link to "View on HashScan"
10. Click HashScan link and show actual transaction on blockchain explorer
11. Zoom to show: from account, to account, amount, timestamp

**Voiceover:**
"The payment is executed instantly on Hedera's blockchain. Since Hedera can handle 10,000 transactions per second and costs just one-tenth of a cent, we can make payments practical for everyday use. And everything is transparent—you can verify it on HashScan, Hedera's block explorer."

**Key Message:**
- Native payments in chat
- Instant Hedera settlement
- Full blockchain transparency
- Practical economics ($0.001)

---

## [2:15-3:10] SPLIT PAYMENTS (55 seconds)

**Script:**
"What if you want to split a bill among friends? We support split payments too. Perfect for group dinners or shared expenses."

**Action:**
1. Click on group conversation
2. Look for "Create Split Payment" button
3. Modal opens
4. Enter total: $120, select equal split
5. Show it calculates per-person: $40 each
6. Add note: "Team dinner 🍽️"
7. Click create
8. Split payment appears in chat with:
   - Total amount: $120
   - Participants: Alice, Bob, Charlie
   - Per-person amount: $40
   - Progress bar showing payments
   - Individual "Pay" buttons for each person
9. Simulate Bob paying: click his "Pay" button
10. Show payment confirmation
11. Bob's share marked as "Paid ✓"
12. Click Charlie's "Pay" button
13. Show completion: all three people paid, progress = 100%

**Voiceover:**
"A common pain point: splitting bills among friends. With HederaSocial, everyone enters the conversation, sees their share, and pays with one click. No awkward 'you owe me' situations, no waiting for money transfers. Instant settlement on Hedera."

**Key Message:**
- Smart split payment logic
- Fair burden-sharing
- Transparent settlement
- Group-native feature

---

## [3:10-3:50] SOCIAL FEED & PROFILE (40 seconds)

**Script:**
"Of course, this is still a social network. You have a feed where users share posts, follow each other, and build their personal brand. Everything is on-chain and verifiable."

**Action:**
1. Navigate to "Explore" or "Feed" tab
2. Show 2-3 posts in feed from demo users
3. Click one post (Alice's: "Just launched HederaSocial...")
4. Show full post with:
   - Author name and avatar
   - Timestamp
   - Like count
   - Comment section
5. Click like button, show count increase
6. Navigate to a user profile (Bob's)
7. Show profile with:
   - Avatar
   - Display name
   - Bio
   - Hedera Account ID: 0.0.xxxxx
   - Follow button (click it)
   - Post count
   - 2-3 recent posts

**Voiceover:**
"Like any social platform, you follow users, like posts, and see a feed. But unlike traditional social networks, your profile is cryptographically verified. Your Hedera account is your identity. No fake accounts, no stolen credentials."

**Key Message:**
- Social graph is verifiable
- Decentralized identity
- Community engagement

---

## [3:50-4:20] NOTIFICATIONS & BALANCE (30 seconds)

**Script:**
"You get real-time notifications when people message you, send you money, or interact with your posts. And you can always check your balance and transaction history."

**Action:**
1. Click notification bell icon in header
2. Show dropdown with 3-4 recent notifications:
   - "Bob sent you $50"
   - "Charlie followed you"
   - "Alice liked your post"
3. Click one notification, show it marks as read
4. Navigate to Payments tab / Balance widget
5. Show balance: $1,000 USD
6. Show payment history:
   - Sent: $50 to Bob
   - Split: $120 divided 3 ways
   - Received: [if applicable]
7. Click one transaction, show details:
   - Both parties visible
   - Amount and timestamp
   - Status: Confirmed
   - Hedera transaction hash
   - "View on HashScan" link

**Voiceover:**
"Real-time notifications keep you in the loop. And your complete payment history is always accessible. Every transaction is stored on Hedera, so you have a permanent, verifiable record."

**Key Message:**
- Real-time alerts
- Payment transparency
- Complete audit trail

---

## [4:20-4:45] CLOSING (25 seconds)

**Voiceover:**
"HederaSocial proves that decentralized social networks don't have to sacrifice usability. We've integrated wallet-as-identity, end-to-end encrypted messaging, and native payments—all powered by Hedera's fast, cheap, and carbon-negative blockchain.

No passwords. No data harvesting. No corporate lock-in. Just crypto-verified identity and peer-to-peer value exchange.

If you want to own your data and your money, join us. HederaSocial: Social Network, Your Way."

**Action:**
1. Final screen with:
   - HederaSocial logo
   - "www.hederasocial.com"
   - GitHub link
   - Discord link
   - "Join the beta" CTA button

---

## SPEAKING NOTES

- Speak clearly and confidently
- Pace: not too fast, not too slow (~150 words/minute)
- Enthusiasm: genuine excitement about the product
- Pause: let visuals breathe, don't narrate every detail
- No "ums" or "likes" - record multiple takes if needed
- Volume: consistent and loud enough to hear over keyboard sounds
```

### Step 2: Prepare Recording Environment

Before recording, checklist:

**Desktop/App Setup:**
- [ ] App fully loaded and responsive
- [ ] Seed data loaded (3 demo users)
- [ ] No notifications or popups visible
- [ ] Clean desktop background
- [ ] Browser in fullscreen (F11 or Cmd+Ctrl+F)
- [ ] Zoom at 125% for readable text
- [ ] All tabs except app closed
- [ ] Do Not Disturb enabled (macOS/Windows)
- [ ] Volume set to reasonable level

**Recording Setup:**
- [ ] Microphone tested and working
- [ ] Background quiet (close doors, fans off)
- [ ] Lighting good (natural or desk lamp)
- [ ] No glare on screen
- [ ] Chair at comfortable height
- [ ] Keyboard and mouse nearby

**Tools:**
- [ ] OBS Studio installed and configured
  - Resolution: 1920x1080 (1080p)
  - Bitrate: 5000 kbps video, 128 kbps audio
  - Format: MP4 or WebM
- [ ] OR: Loom account ready (browser-based, simpler)
- [ ] Script printed or on second monitor

### Step 3: Record the Demo

**Setup OBS Studio (Free Tool):**

```
1. File → New Scene Collection
2. Scene → Add sources:
   - Display Capture (select monitor with app)
   - Audio Input Capture (select microphone)
3. Settings → Output:
   - Recording Format: MP4
   - Encoder: libx264 (CPU) or NVIDIA (if available)
   - Bitrate: 5000 kbps video, 128 kbps audio
4. Start Recording (Ctrl+R)
5. Give yourself 3-second countdown before speaking
```

**Recording Tips:**

1. **Do Multiple Takes**: Record each section separately
   - Intro (0:00-0:10)
   - Auth (0:10-0:35)
   - Messages (0:35-1:15)
   - Payment (1:15-2:15)
   - Split (2:15-3:10)
   - Social (3:10-3:50)
   - Notifications (3:50-4:20)
   - Closing (4:20-4:45)

2. **Slow Down Clicks**: Click buttons deliberately so viewers see what you're doing

3. **Pause Between Actions**: Let things load, give time to read

4. **Record Clear Audio**: Speak directly into microphone, close to lips

5. **Backup Audio**: Record voiceover separately if needed (easier to fix)

### Step 4: Edit Video

**Simple Editing in DaVinci Resolve (Free):**

```
1. Import video files (one per section or continuous)
2. Cut out mistakes or long pauses
3. Add transitions between sections (simple fade)
4. Import voiceover audio if recorded separately
5. Sync audio with video
6. Add title card at start (HederaSocial logo)
7. Add final card with links
8. Export as MP4 (H.264, 1080p)
```

**Or Use Loom (Simpler, Web-Based):**
- Record directly in browser
- Built-in editing tools
- Easy sharing
- Cloud storage

### Step 5: Create Title & End Cards

**Title Card (3 seconds):**
```
[HederaSocial Logo]
[Tagline: "Social Network, Your Way"]
[Blockchain visual or gradient background]
```

**End Card (5 seconds):**
```
HederaSocial

👉 Visit: www.hederasocial.com
👉 GitHub: github.com/yourusername/hedera-social
👉 Discord: discord.gg/hederasocial

Join the beta today!
```

### Step 6: Export & Optimize

**Final Export Settings:**
- Format: MP4
- Codec: H.264 (AVC)
- Resolution: 1920x1080 (1080p)
- Bitrate: 5000 kbps video
- Frame Rate: 30 fps
- Audio: AAC, 128 kbps, 48kHz

**File Size:** ~60-80 MB for 5-minute video

**Upload to:**
- YouTube (unlisted or public)
- GitHub releases
- Google Drive (backup)
- Loom (if using that tool)

---

## Video Content Checklist

### Must Show:
- [ ] Login / wallet connection
- [ ] Sending a message
- [ ] In-chat payment ($50) with success confirmation
- [ ] Payment receipt in chat
- [ ] Transaction on HashScan
- [ ] Split payment creation and settlement
- [ ] User profile with Hedera account ID
- [ ] Notification bell showing real-time alerts
- [ ] Payment balance and history
- [ ] Social feed with posts

### Must Say:
- [ ] "No passwords"
- [ ] "Wallet-as-identity"
- [ ] "Hedera"
- [ ] "10,000 TPS"
- [ ] "Instant settlement"
- [ ] "Transparent and verifiable"
- [ ] "Own your data, own your money"

### Tone:
- [ ] Enthusiastic but not over-the-top
- [ ] Clear and well-paced
- [ ] Professional yet accessible
- [ ] Confident in product

---

## Timing Breakdown

| Section | Duration | Content |
|---------|----------|---------|
| Intro | 0:10 | Hook + problem statement |
| Auth | 0:25 | Wallet connection |
| Messages | 0:40 | Chat UI + encryption |
| Payment | 1:00 | In-chat payment flow + HashScan |
| Split | 0:55 | Split payment demo |
| Social | 0:40 | Feed + profile |
| Notifications | 0:30 | Alerts + balance |
| Closing | 0:25 | Value prop + CTA |
| **Total** | **~4:45** | |

---

## Audio Tips

### Recording Voiceover:
- Speak clearly and confidently
- Pause between sentences
- Vary tone (not monotone)
- Speak a bit slower than normal (~130-150 WPM)
- Record in quiet room with good mic
- Do multiple takes and keep the best

### Sound Effects (Optional):
- Notification ping when alert appears
- Success sound for payment confirmation
- Transition whoosh between sections
- Subtle background music (royalty-free)

### Audio Mixing:
- Voiceover: -3 dB
- Background music: -20 dB (very quiet)
- Sound effects: -10 dB
- Overall: -6 dB to -3 dB (leave headroom)

---

## Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Screen too zoomed in (hard to read) | Use 125% or 100% zoom |
| Mouse movements too fast | Click deliberately, slow down |
| Clicking wrong buttons | Script exact clicks, practice first |
| Long pauses or loading | Record separately, edit together |
| Audio too quiet | Microphone closer, turn up volume |
| Audio too loud | Back away from mic, lower levels |
| Rambling or off-script | Stick to script, do multiple takes |
| Text hard to read | Use large fonts, 100% zoom minimum |
| Background noise | Record in quiet room, close windows |
| No clear ending | Create end card with CTA |

---

## Verification Steps

| Verification Step | Expected Result | Status |
|---|---|---|
| Script written and reviewed | 4:45 video outline with dialogue | ✓ |
| All sections recorded | 8 video clips (one per section) | ✓ |
| Video is clear and readable | Text and UI elements visible at 1080p | ✓ |
| Audio is clear | Voiceover is understandable | ✓ |
| No background noise | Quiet recording environment | ✓ |
| Transitions smooth | Section edits not jarring | ✓ |
| Title and end cards present | Professional opening and closing | ✓ |
| All features shown | Payment, split, notifications, etc. | ✓ |
| Under 5 minutes | Total duration 4:30-5:00 | ✓ |
| HD quality | 1080p minimum resolution | ✓ |
| Exported correctly | MP4 file, 50-80 MB | ✓ |
| Uploaded to multiple locations | YouTube, GitHub, Drive backup | ✓ |

## Definition of Done

- [ ] Script written (500+ words)
- [ ] All sections recorded:
  - [ ] Intro (0:10)
  - [ ] Auth (0:25)
  - [ ] Messages (0:40)
  - [ ] Payment (1:00)
  - [ ] Split (0:55)
  - [ ] Social (0:40)
  - [ ] Notifications (0:30)
  - [ ] Closing (0:25)
- [ ] Video edited and assembled
- [ ] Audio clear and at correct levels
- [ ] Title card created and included
- [ ] End card with CTA created and included
- [ ] Video duration 4:30-5:00 minutes
- [ ] Resolution 1920x1080 or higher
- [ ] Exported as MP4 with H.264 codec
- [ ] File size reasonable (~50-100 MB)
- [ ] Video tested on different browsers/devices
- [ ] Uploaded to YouTube (unlisted or public)
- [ ] Uploaded to GitHub releases
- [ ] Backup copies on Google Drive
- [ ] Video link documented for pitch deck
- [ ] Video reviewed and meets quality standards
- [ ] No spelling or grammar errors in text overlays

## Troubleshooting

### Issue: Audio is too quiet
**Solution**:
- Move microphone closer to mouth
- Increase input level in OBS (-10 dB or lower)
- Re-record section with louder voice
- Normalize audio in post-production (level audio to -6 dB)

### Issue: Recording is laggy or choppy
**Solution**:
- Close other applications
- Lower video bitrate (4000-5000 kbps)
- Lower frame rate (24 or 30 fps)
- Use software encoder (CPU) instead of GPU
- Record on fast SSD, not HDD

### Issue: Can't see text on screen
**Solution**:
- Increase zoom to 125% or 150%
- Use larger fonts in terminal
- Record at 1440p or 4K, downscale to 1080p
- Increase contrast in app

### Issue: Click not visible to viewers
**Solution**:
- Move mouse cursor to location first
- Click deliberately and slowly
- Add cursor highlight effect (OBS plugin)
- Pause video after click so action shows

### Issue: Payment didn't go through during recording
**Solution**:
- Reset demo account balance
- Re-run seed script
- Record payment as separate section
- Edit together in post-production

### Issue: Voiceover doesn't match video timing
**Solution**:
- Record voiceover separately and import
- Adjust video playback speed to match narration
- Use DaVinci Resolve's speed tools

---

## Files to Create/Deliver

1. **Demo Video Script** (`scripts/demo-video-script.md`)
   - Full dialogue with timestamps
   - Action/visual descriptions
   - Speaking notes

2. **Recording Project** (OBS or Loom)
   - Source files and project settings
   - Raw recordings of each section
   - Backup audio

3. **Final Video** (`demo-video.mp4`)
   - Edited and compiled
   - Title and end cards included
   - Correct audio and levels
   - 1080p resolution
   - 4:30-5:00 minutes duration

4. **Video Documentation** (`VIDEO.md`)
   - Link to final video
   - Link to YouTube
   - Link to GitHub releases
   - Recording date and device info
   - Any notes on production

---

## Distribution

### Platforms:

**YouTube:**
- Title: "HederaSocial Demo - Wallet-as-Identity Social Network"
- Description: Link to GitHub, website, Discord
- Tags: hedera, blockchain, social, web3, crypto
- Thumbnail: HederaSocial logo + screenshot
- Privacy: Public or Unlisted (link in pitch deck)

**GitHub:**
- Release attachment or raw.githubusercontent.com link
- Include in README as "Demo Video" section

**Social Media:**
- Twitter: "Check out HederaSocial in action! 🎥"
- LinkedIn: Professional post about the product
- Discord: Share with community

**Pitch Deck:**
- Embed YouTube link in Slide 6
- Or link to video as backup

---

## What Happens Next

1. **Live Presentation**: Use this video as backup if demo fails
2. **Social Media**: Share on YouTube, Twitter, LinkedIn
3. **Hedera Ecosystem**: Share with Hedera ambassadors
4. **Investor Outreach**: Include in follow-up materials
5. **Hackathon**: Submitted alongside code and documentation

---

## Final Notes

- Video quality matters: judges will watch this
- Script must be tight: every second counts
- Show real app, not mockups or slides
- Be proud of what you built: confidence shows
- Good luck! 🚀
