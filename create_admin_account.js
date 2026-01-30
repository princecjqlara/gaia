/**
 * Script to create admin account in Supabase
 * Run this with: node create_admin_account.js
 *
 * Make sure you have the Supabase credentials configured
 */
import crypto from "crypto";

// Helper function to generate a secure random password
function generateSecurePassword() {
  const length = 24;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  const randomValues = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }

  return password;
}

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "❌ Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createAdminAccount() {
  const email = "admin@gaia.com";
  const password = process.env.ADMIN_PASSWORD || generateSecurePassword();
  const name = "Gaia Admin";
  const role = "admin";

  try {
    console.log(`Creating admin account for ${email}...`);

    if (!process.env.ADMIN_PASSWORD) {
      console.log("⚠️  No ADMIN_PASSWORD environment variable set.");
      console.log("🔐 Generated secure password:", password);
      console.log(
        "   IMPORTANT: Save this password securely! You will not see it again.",
      );
    }

    // Step 1: Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
        },
      },
    });

    if (authError) {
      if (
        authError.message.includes("already registered") ||
        authError.message.includes("User already registered")
      ) {
        console.log(
          `⚠️  User ${email} already exists in auth. Attempting to sign in to get user ID...`,
        );

        // Try to sign in to get the user
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) {
          throw new Error(`Could not sign in: ${signInError.message}`);
        }

        const userId = signInData.user.id;
        console.log(`✅ Found existing user with ID: ${userId}`);

        // Step 2: Create/update user profile using function (bypasses RLS)
        const { data: profileData, error: profileError } = await supabase.rpc(
          "create_admin_profile",
          {
            user_id: userId,
            user_email: email,
            user_name: name,
          },
        );

        if (profileError) {
          throw new Error(
            `Failed to create/update profile: ${profileError.message}`,
          );
        }

        console.log(`✅ Admin account created/updated successfully!`);
        console.log(`   Email: ${email}`);
        console.log(`   Name: ${name}`);
        console.log(`   Role: ${role}`);
        console.log(
          `   Password: ${!process.env.ADMIN_PASSWORD ? "(see above)" : "*** (from environment)"}`,
        );
        console.log(`   User ID: ${userId}`);
        return;
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error("User creation failed - no user data returned");
    }

    const userId = authData.user.id;
    console.log(`✅ Auth user created with ID: ${userId}`);

    // Step 2: Create user profile using function (bypasses RLS)
    const { data: profileData, error: profileError } = await supabase.rpc(
      "create_admin_profile",
      {
        user_id: userId,
        user_email: email,
        user_name: name,
      },
    );

    if (profileError) {
      // If function doesn't exist, try direct insert (might fail due to RLS)
      console.log(`⚠️  Function not found, trying direct insert...`);
      const { data: insertData, error: insertError } = await supabase
        .from("users")
        .insert({
          id: userId,
          email,
          name,
          role,
        })
        .select()
        .single();

      if (insertError) {
        // If still fails, try update
        console.log(`⚠️  Insert failed, trying update...`);
        const { data: updateData, error: updateError } = await supabase
          .from("users")
          .update({ role: "admin", name })
          .eq("email", email)
          .select()
          .single();

        if (updateError) {
          throw new Error(
            `Failed to create/update profile: ${updateError.message}. You may need to run the SQL function first (see database/create_admin_function.sql)`,
          );
        }
        console.log(`✅ Profile updated successfully!`);
        return;
      }
    }

    console.log(`✅ Admin account created successfully!`);
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${name}`);
    console.log(`   Role: ${role}`);
    console.log(`   User ID: ${userId}`);
  } catch (error) {
    console.error(`❌ Error creating admin account:`, error.message);
    process.exit(1);
  }
}

createAdminAccount();
