# Chat UI Improvements — Frontend Only

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the Procurely agent chat UI with ChatGPT-style features without any backend changes.

**Architecture:** All changes are in `src/pages/AgentChat.tsx`. Add helper components inline or as small extracted components. Use existing shadcn/ui primitives (Button, Badge, Tooltip). No new dependencies needed.

**Tech Stack:** React 19, Tailwind CSS, lucide-react icons, ReactMarkdown (already installed)

## Global Constraints

- Zero backend changes — all features work with existing `/api/agent/chat` endpoint
- All new UI must be responsive (mobile + desktop)
- Use existing shadcn/ui components and Tailwind classes
- Follow existing code patterns in AgentChat.tsx
- Keep bundle size minimal — no new npm packages

---

### Task 1: Copy Message Button

**Files:**
- Modify: `src/pages/AgentChat.tsx`

**Changes:**
- Add a copy button that appears on hover over any message
- Copy the message content to clipboard
- Show "Copied!" tooltip for 2 seconds after copying
- Use `navigator.clipboard.writeText()`
- Position: top-right of message bubble, only visible on hover

### Task 2: Regenerate Response Button

**Files:**
- Modify: `src/pages/AgentChat.tsx`

**Changes:**
- Add a "Regenerate" button below the last assistant message
- When clicked, remove the last assistant message and resend the last user message
- Show the button only when not loading and there's at least one assistant message
- Use existing `handleSend` function with the last user message

### Task 3: Code Block Copy Button

**Files:**
- Modify: `src/pages/AgentChat.tsx` (custom ReactMarkdown renderer)

**Changes:**
- Add a custom `code` renderer for ReactMarkdown
- Show a "Copy" button in the top-right of code blocks
- Style code blocks with a header bar showing the language + copy button
- Use `navigator.clipboard.writeText()` for copying

### Task 4: Suggested Prompts (Empty State)

**Files:**
- Modify: `src/pages/AgentChat.tsx`

**Changes:**
- When no messages, show 4 suggested prompt cards
- Cards: "I need 10 laptops under $15K", "Find IT software suppliers", "Check procurement policy for travel", "Research cloud hosting prices"
- Clicking a card sends that message
- Style as clickable cards with icons, centered in the chat area

### Task 5: Message Timestamps

**Files:**
- Modify: `src/pages/AgentChat.tsx`

**Changes:**
- Add `timestamp` field to Message interface
- Set timestamp when message is created
- Show relative time (e.g., "2 min ago") below each message
- Style as small muted text, only visible on hover or for older messages

### Task 6: Modern Input Area

**Files:**
- Modify: `src/pages/AgentChat.tsx`

**Changes:**
- Replace `<input>` with `<textarea>` for multi-line input
- Auto-resize textarea as user types (max 4 rows)
- Move send button inside the textarea (right side, like ChatGPT)
- Move file attach button to left of textarea
- Add keyboard shortcut: Enter to send, Shift+Enter for newline
- Style: rounded border, gray background, shadow on focus

### Task 7: Polish & Integration

**Files:**
- Modify: `src/pages/AgentChat.tsx`

**Changes:**
- Smooth scroll to bottom on new messages
- Better streaming text animation (cursor blink)
- Improve loading state with "Procurely is thinking..." text
- Ensure all new features work on mobile
- Test all features together

---

## Verification

1. Open the app → chat page should show suggested prompts
2. Click a suggested prompt → message sends, response streams
3. Hover over any message → copy button appears
4. Click copy → "Copied!" tooltip shows
5. After response → "Regenerate" button appears below it
6. Click regenerate → last response removed, new one generated
7. Type code in chat → code block has copy button
8. Click code copy → code copied to clipboard
9. Type multi-line message → textarea grows
10. Press Enter → sends, Shift+Enter → new line
11. All features work on mobile viewport
