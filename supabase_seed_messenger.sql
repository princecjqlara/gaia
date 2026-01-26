-- Seed Data for Facebook Messenger (Mock Clients)
-- Run this in Supabase SQL Editor to populate your inbox
-- 0. Insert Mock Page (to satisfy foreign keys if any)
INSERT INTO facebook_pages (page_id, page_name, is_active, updated_at)
VALUES (
        'mock_page_1',
        'Gaia Realty Demo Page',
        true,
        NOW()
    ) ON CONFLICT (page_id) DO NOTHING;
-- 1. Insert Mock Conversations
-- We use the same names as the AI Assistant Property Views demo so features work together.
INSERT INTO facebook_conversations (
        conversation_id,
        participant_name,
        participant_id,
        page_id,
        last_message_text,
        unread_count,
        last_message_time,
        updated_at,
        lead_status
    )
VALUES (
        'mock_conv_1',
        'John Doe',
        'psid_001',
        'mock_page_1',
        'Is the modern villa in Forbes Park still available?',
        1,
        NOW(),
        NOW(),
        'new_lead'
    ),
    (
        'mock_conv_2',
        'Sarah Smith',
        'psid_002',
        'mock_page_1',
        'Can you send me the floor plan for the Downtown Condo?',
        1,
        NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '2 hours',
        'interested'
    ),
    (
        'mock_conv_3',
        'Mike Ross',
        'psid_003',
        'mock_page_1',
        'I would like to schedule a viewing for next Tuesday.',
        0,
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day',
        'appointment_booked'
    ),
    (
        'mock_conv_4',
        'Jessica Pearson',
        'psid_004',
        'mock_page_1',
        'What are the payment terms for the commercial lot?',
        0,
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '2 days',
        'qualified'
    ),
    (
        'mock_conv_5',
        'Harvey Specter',
        'psid_005',
        'mock_page_1',
        'I''m looking for a penthouse in BGC. Budget is not an issue.',
        0,
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '3 days',
        'hot_lead'
    ) ON CONFLICT (conversation_id) DO NOTHING;
-- 2. Insert Mock Messages for the conversations
-- John Doe Messages
INSERT INTO facebook_messages (
        message_id,
        conversation_id,
        sender_name,
        message_text,
        is_from_page,
        timestamp,
        is_read
    )
VALUES (
        'msg_1_1',
        'mock_conv_1',
        'John Doe',
        'Hi, I saw your listing online.',
        false,
        NOW() - INTERVAL '5 minutes',
        false
    ),
    (
        'msg_1_2',
        'mock_conv_1',
        'John Doe',
        'Is the modern villa in Forbes Park still available?',
        false,
        NOW(),
        false
    ) ON CONFLICT (message_id) DO NOTHING;
-- Sarah Smith Messages
INSERT INTO facebook_messages (
        message_id,
        conversation_id,
        sender_name,
        message_text,
        is_from_page,
        timestamp,
        is_read
    )
VALUES (
        'msg_2_1',
        'mock_conv_2',
        'Sarah Smith',
        'Hello',
        false,
        NOW() - INTERVAL '3 hours',
        true
    ),
    (
        'msg_2_2',
        'mock_conv_2',
        'Gaia Agent',
        'Hi Sarah! How can I help you today?',
        true,
        NOW() - INTERVAL '2 hours 30 minutes',
        true
    ),
    (
        'msg_2_3',
        'mock_conv_2',
        'Sarah Smith',
        'Can you send me the floor plan for the Downtown Condo?',
        false,
        NOW() - INTERVAL '2 hours',
        false
    ) ON CONFLICT (message_id) DO NOTHING;
-- Mike Ross Messages
INSERT INTO facebook_messages (
        message_id,
        conversation_id,
        sender_name,
        message_text,
        is_from_page,
        timestamp,
        is_read
    )
VALUES (
        'msg_3_1',
        'mock_conv_3',
        'Mike Ross',
        'Good morning.',
        false,
        NOW() - INTERVAL '1 day 2 hours',
        true
    ),
    (
        'msg_3_2',
        'mock_conv_3',
        'Gaia Agent',
        'Good morning Mike! Are you interested in a specific property?',
        true,
        NOW() - INTERVAL '1 day 1 hour',
        true
    ),
    (
        'msg_3_3',
        'mock_conv_3',
        'Mike Ross',
        'Yes, the 3-bedroom unit.',
        false,
        NOW() - INTERVAL '1 day',
        true
    ),
    (
        'msg_3_4',
        'mock_conv_3',
        'Mike Ross',
        'I would like to schedule a viewing for next Tuesday.',
        false,
        NOW() - INTERVAL '1 day',
        true
    ) ON CONFLICT (message_id) DO NOTHING;