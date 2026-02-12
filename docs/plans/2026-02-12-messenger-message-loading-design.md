# Messenger Message Loading Design

## Goal
- Start thread view at the bottom (latest visible)
- Load only recent messages on open (8 to 15 max)
- Load older messages only when the user scrolls up

## Current Constraints
- Messages are stored in Supabase (`facebook_messages`)
- UI rendering and scroll handling live in `MessengerInbox`
- Data loading and pagination are handled by `useFacebookMessenger`

## Proposed Behavior
1. Initial load limit: fetch 8 most recent messages on selection.
2. Auto-fill: if the viewport is not filled, fetch older messages in small batches until the frame is filled or 15 total messages are shown.
3. Scroll-up pagination: when the user reaches the top threshold, fetch older messages and preserve scroll position.
4. Refresh behavior: background refreshes keep the current limit to avoid auto-expanding the thread.

## Data Flow
- `selectConversation` -> `getMessages(limit=8)` -> render -> auto-fill effect -> optional `loadMoreMessages(batch)`
- `onScroll` near top -> `loadMoreMessages(limit=15 default)`
- `refreshMessages` uses the current message limit

## UX Notes
- The view stays anchored at the bottom on first load.
- A light indicator prompts users to scroll up for earlier messages.
