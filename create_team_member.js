/**
 * Script to create team member accounts in Supabase
 * Run this with: node create_team_member.js <email> <password> <name> [role]
 * 
 * Examples:
 *   node create_team_member.js john@example.com password123 "John Doe"
 *   node create_team_member.js jane@example.com password123 "Jane Smith" admin
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bbthbdnfskatvvwxprze.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJidGhiZG5mc2thdHZ2d3hwcnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTkzNjksImV4cCI6MjA4Mjk5NTM2OX0.NXU7NV9qwzGTL_7g9WE3oeaJZ1ooPM9nTXoKfhiqfFM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createTeamMember(email, password, name, role = 'user') {
    try {
        console.log(`\n📝 Creating team member account...`);
        console.log(`   Email: ${email}`);
        console.log(`   Name: ${name}`);
        console.log(`   Role: ${role}`);
        console.log('');

        // Step 1: Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    role
                }
            }
        });

        if (authError) {
            if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
                console.log(`⚠️  User ${email} already exists.`);
                return;
            }
            throw authError;
        }

        if (!authData.user) {
            throw new Error('User creation failed - no user data returned');
        }

        const userId = authData.user.id;
        console.log(`✅ Auth user created with ID: ${userId}`);

        // Step 2: Create user profile
        // The trigger should handle this, but let's try a direct insert as backup
        const { error: profileError } = await supabase
            .from('users')
            .upsert({
                id: userId,
                email,
                name,
                role
            }, { onConflict: 'id' });

        if (profileError) {
            console.log(`⚠️  Profile insert note: ${profileError.message}`);
            console.log(`   (The auth trigger may have already created the profile)`);
        }

        console.log(`\n✅ Team member account created successfully!`);
        console.log(`   Email: ${email}`);
        console.log(`   Name: ${name}`);
        console.log(`   Role: ${role}`);
        console.log(`   User ID: ${userId}`);
        console.log(`\n📌 The user can now log in to Campy and will appear in the "Assigned To" dropdown.`);

    } catch (error) {
        console.error(`\n❌ Error creating account:`, error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
    console.log(`
📋 Usage: node create_team_member.js <email> <password> <name> [role]

Arguments:
  email     - User's email address (required)
  password  - Login password, min 6 chars (required)
  name      - Display name (required)
  role      - 'user' or 'admin' (optional, defaults to 'user')

Examples:
  node create_team_member.js john@example.com pass123 "John Doe"
  node create_team_member.js jane@example.com pass123 "Jane Smith" admin
`);
    process.exit(1);
}

const [email, password, name, role] = args;

if (password.length < 6) {
    console.error('❌ Error: Password must be at least 6 characters');
    process.exit(1);
}

if (role && !['user', 'admin'].includes(role)) {
    console.error('❌ Error: Role must be "user" or "admin"');
    process.exit(1);
}

createTeamMember(email, password, name, role || 'user');
