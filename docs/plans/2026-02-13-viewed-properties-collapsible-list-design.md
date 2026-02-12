# Viewed Properties Collapsible List Design

Date: 2026-02-13
Status: Approved

## Overview

Replace the single viewed-property card with a compact, collapsible list that can load the full viewed history in newest-first order. The initial view stays lightweight while expanded view supports a loader and incremental loading.

## Goals

- Show all viewed properties in strict newest-first order.
- Keep the default view fast and simple.
- Provide a loader and incremental loading for long histories.
- Keep existing per-property actions intact.

## Non-Goals

- No changes to property tracking schema.
- No changes to message or conversation pagination.

## Current Behavior

- Conversation insights fetch up to 5 records from `property_views` and map them to `viewedProperties`.
- The UI shows only one viewed property card (most recent).

## Proposed Behavior

### Collapsible UI

- Collapsed state shows the latest 3 items from `conversationInsights.viewedProperties`.
- Toggle button: "Show all viewed properties" / "Hide viewed properties".
- On expand, fetch paged results; show inline loader while loading.
- Expanded list uses the compact row layout (thumbnail, title, price, beds/baths, actions).
- "Load more" button appends pages; shows a small loading state.

### Data Fetching

- Add `facebookService.getViewedProperties(participantId, visitorName, { page, pageSize })`.
- Query `property_views` with the same OR conditions as insights.
- Order by `created_at` descending; use `.range()` for pagination.
- Return `{ items, hasMore }` plus optional `error` if present.

### Error Handling

- If the paged fetch fails, keep the section open and show a small inline error with a Retry button.
- Do not trigger global error banners for this section.

## UI State

Maintain local state in `MessengerInbox`:

- `viewedExpanded`
- `viewedLoading`
- `viewedItems`
- `viewedPage`
- `viewedHasMore`
- `viewedError`

Reset state whenever `selectedConversation` changes.

## Testing

- Verify collapsed list shows latest 3 items.
- Expand loads page 1 and shows loader until data arrives.
- Load more appends results and respects order.
- Switch conversations resets state.

## Rollout

- No migrations required.
- Manual QA on large view histories.
