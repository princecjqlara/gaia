# Creating Admin Account: admin@gaia.com

## Quick Start (Recommended)

### Step 1: Create the Database Function

Run this SQL in Supabase SQL Editor first:

```sql
CREATE OR REPLACE FUNCTION create_admin_profile(
  user_id UUID,
  user_email TEXT,
  user_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO users (id, email, name, role)
  VALUES (user_id, user_email, user_name, 'admin')
  ON CONFLICT (email) 
  DO UPDATE SET 
    role = 'admin',
    name = user_name,
    id = user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_admin_profile(UUID, TEXT, TEXT) TO authenticated;
```

### Step 2: Run the Script

```bash
npm run create-admin
```

Or:

```bash
node create_admin_account.js
```

## Alternative Methods

### Method 1: Using admin_setup.html

1. Open `admin_setup.html` in your browser
2. Click "Create Admin Accounts"
3. The script will create the admin account automatically

### Method 2: Manual Creation via Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add User"** → **"Create new user"**
4. Enter:
   - Email: `admin@gaia.com`
   - Password: `Gaia_Admin_26`
   - Auto Confirm User: **Yes** (to skip email verification)
5. Click **"Create user"**
6. Copy the User UUID from the created user
7. Go to **SQL Editor** and run:

```sql
-- First, run the function creation SQL above, then:
SELECT create_admin_profile(
  'PASTE_UUID_HERE'::UUID,
  'admin@gaia.com',
  'Gaia Admin'
);
```

Replace `PASTE_UUID_HERE` with the actual UUID from step 5.

### Method 3: Direct SQL (if RLS allows)

If you have direct database access or can temporarily disable RLS:

```sql
INSERT INTO users (id, email, name, role) VALUES
  ('USER_UUID_HERE', 'admin@gaia.com', 'Gaia Admin', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';
```

## Verification

After creating the account, you can verify by:
1. Logging in to the application with:
   - Email: `admin@gaia.com`
   - Password: `Gaia_Admin_26`
2. You should see admin features (Settings button, expense stats, etc.)

## Troubleshooting

If you get "infinite recursion detected in policy" error:
- Make sure you've run the `create_admin_function.sql` first
- The function uses `SECURITY DEFINER` to bypass RLS policies

If the user already exists:
- The script will automatically update the existing user to admin role
- Or manually run: `UPDATE users SET role = 'admin' WHERE email = 'admin@gaia.com';`

