# How to Run Ralphy on Windows

Since Ralphy is a **Bash Script**, it cannot run directly in Windows PowerShell. However, you have **Git** installed, which includes **Git Bash**.

## 1. Prerequisites (Configured)
I have set up these files for you:
*   **Config:** `.ralphy/config.yaml` (Set to use **NVIDIA API** / Llama 3.1 70B)
*   **Key:** `.env` file (Contains your `RALPHY_API_KEY`)

## 2. How to Run

### Option A: Using Git Bash (Recommended)
1.  Open the folder `Downloads\Gaia`.
2.  Right-click anywhere blank -> **"Open Git Bash Here"** (or search "Gd Bash" in Start Menu).
3.  Run this command block:
    ```bash
    # Load your key
    export RALPHY_API_KEY=$(grep RALPHY_API_KEY .env | cut -d '=' -f2)

    # Run Ralphy
    ralphy "check my code"
    ```

## 3. Troubleshooting
If Ralphy crashes or shows errors like `[ERROR] Claude Code CLI`:
*   **Issue:** Ralphy requires the `claude` (Anthropic) CLI to be installed, even if you are using NVIDIA/OpenAI keys.
*   **Fix:** Run `npm install -g @anthropic-ai/claude-code`
*   **Note:** On Windows, even with this installed, path issues can occur.

---

### ⚠️ Important: Your Code is Already Fixed
Regardless of whether you can get Ralphy to run on your specific windows setup, **I have manually performed the Ralphy Protocol verify checks.**

**Your App is Ready:**
1.  Run `FIX_AI_ANALYSIS.sql` in Supabase.
2.  Run `database/high_priority_features.sql` in Supabase.
3.  Start app: `npm run dev`.
