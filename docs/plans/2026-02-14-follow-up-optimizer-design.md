# Follow-up Optimizer Design
Date: 2026-02-14

## Summary
Replace the single follow-up prompt section with a new Settings tab that manages multiple prompt variants per follow-up step. Prompts generate reusable message templates, scored by reply + booked outcomes, and the global top-scoring prompt per step is used for all contacts. Messages are personalized at send time and scheduled using Fibonacci cadence snapped to best-time-to-contact slots.

## Goals
- Allow multiple prompt variants per follow-up step with scoring and winner selection.
- Pre-generate reusable message templates and personalize at send time.
- Use Fibonacci-based cadence aligned to Best Time to Contact.
- Track reply + booked outcomes and show points-based metrics.

## Non-goals
- Segment-based or per-contact prompt selection.
- Arbitrary custom step counts/delays in this phase.
- Real-time LLM generation per contact on every send.

## UX / Settings Tab
- New top-level tab in `src/components/AdminSettingsModal.jsx`: "Follow-up Optimizer".
- Step selector: Step 1/2/3 with Fibonacci index and best-time indicator (uses existing aggressiveness shift).
- Prompt variants list per step:
  - Name, active toggle, score, reply rate, booked rate, winner badge.
  - Inline editor for prompt text (supports bullet-style instructions).
  - "Generate Templates" action + templates preview.
- Metrics panel:
  - Sent, replies, booked, points.
  - Attribution rule: "reply before next follow-up".

## Data Model
New tables (Supabase):
- `followup_prompt_steps`:
  - id, step_key ('step_1','step_2','step_3'), label, fibonacci_index, is_active, created_at, updated_at.
- `followup_prompt_variants`:
  - id, step_id, page_id, name, prompt_text, is_active, score_points, created_at, updated_at.
- `followup_prompt_templates`:
  - id, variant_id, template_order, message_text, created_at, last_used_at.
- `followup_prompt_metrics`:
  - variant_id, sent_count, reply_count, booked_count, last_reply_at, last_booked_at.

Extend `ai_followup_schedule` (or use `ai_action_log` action_data) to record:
- step_key, prompt_variant_id, template_id, attribution_window_end.

## Prompt Template Generation
- On variant save or explicit "Generate Templates":
  - Call NVIDIA chat to produce N short messages (1-2 sentences each).
  - Store each message as a template row.
- If generation fails, variant stays saved but is flagged as "no templates".

## Message Selection + Personalization
- When sending a due follow-up (`api/scheduled/process.js`):
  1. Determine step_key from follow-up count.
  2. Select global top-scoring active variant for that step.
  3. Choose next template (round-robin) and personalize placeholders.
- Supported placeholders (initial):
  - {first_name}, {full_name}, {page_name}, {booking_link}, {last_message_snippet}.
- Fallbacks:
  - If no templates, use existing AI follow-up generator or fallback canned message.

## Timing (Fibonacci + Best Time)
- Use current Fibonacci logic from `src/services/intuitionFollowUp.js` for step offsets.
- After computing the base scheduled time, snap to the next Best Time to Contact slot at or after the base time using `calculateBestTimeToContact`.
- Respect cooldowns and user-specific "best time" disable flags.

## Attribution + Scoring
- Points: reply = 1, booked = 5 (constants, adjustable later).
- Reply attribution:
  - Find latest followup_sent event for the conversation.
  - Attribute reply if it arrives before the next scheduled follow-up step.
- Booked attribution:
  - If pipeline_stage becomes `booked` before the next step, add booked points to the same variant.
- Metrics are updated in `followup_prompt_metrics` and surfaced in UI.

## API / Service Changes
- Add endpoints for:
  - CRUD prompt variants + templates.
  - Generate templates for a variant.
  - Fetch metrics per step.
- Update `api/scheduled/process.js` to use variants/templates instead of generating a new LLM message per send.
- Update webhook to log followup_sent events and attribute inbound replies + bookings.

## Rollout
- Existing "AI-Generated Follow-ups" toggle remains the global on/off switch.
- Old Follow-up Prompts section is removed from Settings.

## Open Questions
- None for this phase (use global top scorer per step).
