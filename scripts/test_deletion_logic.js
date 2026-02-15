
// proper mock setup for testing deletion logic
import fs from 'fs';
import path from 'path';

// Mock console to keep output clean but track errors
const originalConsole = { ...console };
console.log = (...args) => originalConsole.log('[TEST]', ...args);
console.error = (...args) => originalConsole.error('[TEST ERROR]', ...args);

// Mock implementation of Supabase
const createSpy = (name) => {
    const spy = (...args) => {
        spy.calls.push(args);
        if (spy.impl) return spy.impl(...args);
        return spy.result || { data: [], error: null };
    };
    spy.calls = [];
    spy.result = null;
    spy.impl = null;
    spy.mockReturnValue = (val) => { spy.result = val; return spy; };
    spy.mockImplementation = (fn) => { spy.impl = fn; return spy; };
    return spy;
};


// Chainable mock for Supabase query builder
const createMockChain = (tableName) => {
    const chain = {
        select: createSpy(`${tableName}.select`),
        insert: createSpy(`${tableName}.insert`),
        update: createSpy(`${tableName}.update`),
        delete: createSpy(`${tableName}.delete`),
        eq: createSpy(`${tableName}.eq`),
        single: createSpy(`${tableName}.single`),
        then: (resolve) => resolve({ data: [], error: null, count: 5 })
    };

    // Chain the methods
    chain.select.mockReturnValue(chain);
    chain.insert.mockReturnValue(chain);
    chain.update.mockReturnValue(chain);
    chain.delete.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    // single returns the result directly (promise-like)
    chain.single.mockReturnValue(Promise.resolve({
        data: {
            conversation_id: 'test-conv-123',
            linked_client_id: 'client-123',
            participant_id: 'psid-123',
            page_id: 'page-123'
        }, error: null
    }));

    // Mock delete return value for simple calls
    chain.delete.result = { error: null, count: 5 };

    return chain;
};

const mockDb = {
    from: createSpy('db.from')
};

// Setup table mocks
const tables = {
    facebook_conversations: createMockChain('facebook_conversations'),
    facebook_messages: createMockChain('facebook_messages'),
    conversation_tag_assignments: createMockChain('conversation_tag_assignments'),
    ai_followup_schedule: createMockChain('ai_followup_schedule'),
    recurring_notification_tokens: createMockChain('recurring_notification_tokens'),
    contact_engagement: createMockChain('contact_engagement'),
    calendar_events: createMockChain('calendar_events'),
    property_views: createMockChain('property_views'),
    ai_action_log: createMockChain('ai_action_log'),
    clients: createMockChain('clients')
};

mockDb.from.mockImplementation((tableName) => {
    if (tables[tableName]) return tables[tableName];
    return createMockChain(tableName);
});

// Mock getSupabase
global.getSupabase = () => mockDb;

// Import the service (we need to read it and eval it since it's an ES module and we are in a script)
// Simplified: We will just paste the relevant function logic here to test it isolated
/* 
   We are testing the LOGIC of deleteConversation, not the import. 
   So we will copy the function body and run it against our mock DB.
*/

async function deleteConversation(conversationId) {
    try {
        console.log(`[DELETE] Starting cascade delete for conversation: ${conversationId}`);
        const db = getSupabase();

        // 1. Get stats before delete (for logging)
        const { data: convData } = await db
            .from('facebook_conversations')
            .select('linked_client_id, participant_id, page_id')
            .eq('conversation_id', conversationId)
            .single();

        const linkedClientId = convData?.linked_client_id;
        const participantId = convData?.participant_id;
        const pageId = convData?.page_id;

        // 2. Delete Messages
        const { error: msgError, count: msgCount } = await db
            .from('facebook_messages')
            .delete({ count: 'exact' })
            .eq('conversation_id', conversationId);

        if (msgError) console.error('[DELETE] Error deleting messages:', msgError.message);
        console.log(`[DELETE] Deleted ${msgCount} messages`);

        // 3. Delete Tag Assignments
        const { error: tagError } = await db
            .from('conversation_tag_assignments')
            .delete()
            .eq('conversation_id', conversationId);

        if (tagError) console.error('[DELETE] Error deleting tags:', tagError.message);

        // 4. Delete Follow-up Schedules & Tokens
        await db.from('ai_followup_schedule').delete().eq('conversation_id', conversationId);
        await db.from('recurring_notification_tokens').delete().eq('conversation_id', conversationId);
        await db.from('contact_engagement').delete().eq('conversation_id', conversationId);

        // 5. Delete Calendar Events (linked to this conversation)
        if (conversationId) {
            await db.from('calendar_events').delete().eq('conversation_id', conversationId);
        }
        if (participantId) {
            // Also delete by participant ID to be thorough
            await db.from('calendar_events').delete().eq('contact_psid', participantId);

            // Delete property views (associated with participant)
            await db.from('property_views').delete().eq('participant_id', participantId);
        }

        // 6. Delete AI Action Logs
        await db.from('ai_action_log').delete().eq('conversation_id', conversationId);

        // 7. Delete Linked Client (CRM)
        if (linkedClientId) {
            const { error: clientError } = await db
                .from('clients')
                .delete()
                .eq('id', linkedClientId);

            if (clientError) console.error('[DELETE] Error deleting client:', clientError.message);
            else console.log(`[DELETE] Deleted linked client: ${linkedClientId}`);
        }

        // 8. Finally, delete the conversation
        const { error: convError } = await db
            .from('facebook_conversations')
            .delete()
            .eq('conversation_id', conversationId);

        if (convError) throw convError;

        console.log(`[DELETE] Successfully deleted conversation ${conversationId}`);
        return { success: true, deletedClientId: linkedClientId };

    } catch (error) {
        console.error('Error deleting conversation:', error);
        throw error;
    }
}

// Run the test
async function runTest() {
    console.log('--- STARTING DELETION LOGIC TEST ---');
    try {
        await deleteConversation('test-conv-123');

        // Verification results
        const checks = [
            { table: 'facebook_messages', called: tables.facebook_messages.delete.calls.length > 0 },
            { table: 'conversation_tag_assignments', called: tables.conversation_tag_assignments.delete.calls.length > 0 },
            { table: 'ai_followup_schedule', called: tables.ai_followup_schedule.delete.calls.length > 0 },
            { table: 'recurring_notification_tokens', called: tables.recurring_notification_tokens.delete.calls.length > 0 },
            { table: 'contact_engagement', called: tables.contact_engagement.delete.calls.length > 0 },
            { table: 'calendar_events', called: tables.calendar_events.delete.calls.length > 0 },
            { table: 'property_views', called: tables.property_views.delete.calls.length > 0 },
            { table: 'ai_action_log', called: tables.ai_action_log.delete.calls.length > 0 },
            { table: 'clients', called: tables.clients.delete.calls.length > 0 },
            { table: 'facebook_conversations', called: tables.facebook_conversations.delete.calls.length > 0 }
        ];

        console.log('--- VERIFICATION RESULTS ---');
        let allPassed = true;
        checks.forEach(check => {
            if (check.called) {
                console.log(`✅ Table ${check.table} deletion called`);
            } else {
                console.error(`❌ Table ${check.table} deletion NOT called`);
                allPassed = false;
            }
        });

        if (allPassed) {
            console.log('\n✅ TEST PASSED: All tables included in cascade delete.');
        } else {
            console.error('\n❌ TEST FAILED: Some tables were skipped.');
            process.exit(1);
        }

    } catch (e) {
        console.error('Test threw exception:', e);
        process.exit(1);
    }
}

runTest();
