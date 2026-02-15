# Similarity Section Design

## Goal
Add a Similarity section in the Messenger Inbox right sidebar that analyzes the current contact, finds similar successful contacts (lead_status: converted or appointment_booked), and recommends a follow-up sequence and approach based on winning patterns. Show who matched, why they were similar, which approach triggered success, and what steps are already done for the current contact.

## Decisions
- Approach: Option B (AI ranking on top of existing fields).
- Success cohort: lead_status in converted + appointment_booked.
- Placement: Messenger Inbox right sidebar.
- Automation: recommend only (no auto scheduling or prompt changes).
- Inputs: existing fields only; no new tables.

## Architecture
Add a client-side similarity service used by Messenger Inbox. The service builds a compact profile for the current conversation from existing insights and fields, fetches a success cohort on the same page, and calls nvidiaChat to rank similarity and recommend an approach. The UI renders the results in a new Similarity panel. No database schema changes are required, and results are not persisted.

## Components and UI
Add a new Similarity panel in the Messenger Inbox right sidebar where the prior AI Insights block lived (below Lead Status and the Analyze button). The card matches existing visual patterns (bg-secondary, border, radius) and includes a header with a score badge and a Refresh button. The body shows: (1) Top matches list (1-3) with name, status badge, and similarity score; (2) "Why similar" chips grounded in tags, niche, message cadence, viewed property interest, and AI summary details; (3) Winning approach block that names the approach and cites the successful contact(s) and trigger (follow_up_type, flow, property showcase); (4) Recommended sequence for the current contact (2-4 steps) labeled as recommendation only; (5) Steps already done checklist derived from sent/pending follow-ups, booking status, and recent AI actions. Loading uses skeleton rows; empty state explains when no successful contacts exist. Mobile collapses into an accordion.

## Data Flow
1. Trigger on conversation selection when the similarity panel is visible. Call similarityService.getSimilarity(conversationId, pageId) with a short cache and show a skeleton state.
2. Build the target profile from conversationInsights (message stats, booking, viewed properties, best time), aiAnalysis (leadScore, notes, details), facebook_conversations (lead_status, ai_summary/ai_notes, extracted_details, last_message_time, pipeline_stage), and tags. Pull last 20 ai_followup_schedule and ai_action_log entries to build steps already done and behavior cues.
3. Fetch the success cohort from facebook_conversations where page_id matches and lead_status in (converted, appointment_booked), limit 20-30, exclude current. For each candidate, fetch tags, recent follow-up types, and key action log events.
4. Pre-filter with a heuristic score (tag/niche overlap, viewed property type/price range, recency, leadScore proximity) and keep the top 8 candidates.
5. Call nvidiaChat with a strict JSON schema to rank matches and return similarity_factors, winning_approach with evidence actions, recommendedSequence steps with timing and rationale, current_steps_done, and confidence.
6. Render top matches and recommendations. Cache per conversation_id until manual refresh or conversation change.

## Error Handling
If Supabase queries fail, show an inline error state with Retry and keep the rest of the sidebar usable. If the success cohort is empty, show an empty state and skip the AI call. If the NVIDIA key is missing, the AI call times out, or JSON parsing fails, fall back to heuristic-only ranking and mark the result with a Heuristic badge. For partial data, render what is available and show a Limited data note. Guard against stale results when switching conversations by discarding out-of-date responses. Truncate long summaries/notes to avoid token overflow and lower confidence when truncation occurs.

## Testing
Add unit tests for similarityService to verify heuristic scoring, truncation, JSON parsing, and AI failure fallback. Mock nvidiaChat and Supabase calls. Add React Testing Library tests for the Similarity panel: loading skeleton, empty state, error state with Retry, heuristic badge, and full render of matches, sequence, and steps done. Add a test that confirms stale requests are ignored when conversationId changes. If automation is limited, complete a manual QA checklist covering panel load, refresh, cohort match, AI failure fallback, and non-blocking UI.

## Open Questions
- None.
