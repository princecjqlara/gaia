import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY; // Use Service Role if available for deletion/insertion
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log("Verifying Page ID logic...");

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ Missing Supabase credentials in .env");
        process.exit(1);
    }

    // 1. Check if column exists
    console.log("Checking if 'page_id' column exists...");
    const { error: colError } = await supabase.from('property_views').select('page_id').limit(1);
    if (colError) {
        console.error("❌ Column 'page_id' does NOT exist in 'property_views'.");
        console.error("   Please run the migration 'add_page_id_to_views.sql' in your Supabase SQL Editor.");
        console.error("   Error details:", colError.message);
        return;
    }
    console.log("✅ Column 'page_id' exists.");

    // 2. Setup test data
    const testName = "CrossPageTestUser_" + Date.now();
    const pageA = "page_A_" + Date.now();
    const pageB = "page_B_" + Date.now();

    // We need a property_id that exists or just satisfy validation. 
    // Assuming property_views doesn't enforce FK strictly or we can use NULL? 
    // It usually allows NULL if not STRICT. Or we might fail if FK constraint exists.
    // Let's assume we need a valid property_id. We'll fetch one first.
    const { data: props } = await supabase.from('properties').select('id, title').limit(1);
    const propId = props?.[0]?.id;
    const propTitle = props?.[0]?.title || "Test Prop";

    if (!propId) {
        console.log("⚠️ No properties found to link to. Inserting dummy views might fail if FK enforced.");
    }

    try {
        console.log(`Inserting test views for visitor '${testName}'...`);
        // Insert view for Page A
        const { error: errA } = await supabase.from('property_views').insert({
            visitor_name: testName,
            page_id: pageA,
            property_id: propId, // Might be null if no props
            property_title: propTitle + " (Page A)",
            source: "test_verification_script",
            viewed_at: new Date().toISOString()
        });
        if (errA) throw new Error("Insert A failed: " + errA.message);

        // Insert view for Page B
        const { error: errB } = await supabase.from('property_views').insert({
            visitor_name: testName,
            page_id: pageB,
            property_id: propId,
            property_title: propTitle + " (Page B)",
            source: "test_verification_script",
            viewed_at: new Date().toISOString()
        });
        if (errB) throw new Error("Insert B failed: " + errB.message);

        console.log(`✅ Inserted views on '${pageA}' and '${pageB}'.`);

        // 3. Query for Page A (mimicking facebookService logic)
        console.log(`Querying for Page A (${pageA})...`);

        // Logic from facebookService:
        // .or(`participant_id.eq.PX,and(visitor_name.eq.${testName},page_id.eq.${pageA})`)
        // We simulate the fallback case where participant_id is null/irrelevant

        const filter = `and(visitor_name.eq.${testName},page_id.eq.${pageA})`;
        console.log(`Filter: ${filter}`);

        const { data: resultsA, error: queryError } = await supabase
            .from('property_views')
            .select('property_title, page_id')
            .or(filter);

        if (queryError) throw queryError;

        console.log("Results for Page A:", resultsA);

        const hasA = resultsA.some(r => r.page_id === pageA);
        const hasB = resultsA.some(r => r.page_id === pageB);

        if (hasA && !hasB) {
            console.log("✅ SUCCESS! Only Page A data retrieved for Page A context.");
        } else {
            console.error("❌ FAILURE! Data leakage detected or data missing.");
            if (hasB) console.error("   - Leaked Page B data! (Should NOT happen)");
            if (!hasA) console.error("   - Missing Page A data! (Should happen)");
        }
    } catch (e) {
        console.error("❌ Test failed with error:", e.message);
    } finally {
        // cleanup anywhere we inserted
        console.log("Cleaning up test data...");
        await supabase.from('property_views').delete().eq('visitor_name', testName);
        console.log("Cleanup complete.");
    }
}

verify();
