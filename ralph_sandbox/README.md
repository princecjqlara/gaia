# 🍌 Ralph Wiggum Sandbox

> "I like making code!" - Ralph

This sandbox implements the **Ralph Wiggum AI Loop Technique** for your project.
It repeatedly feeds a prompt to Ralphy until the task is marked "DONE".

## How to Use (Git Bash)

1.  **Edit `PROMPT.md`**:
    Write your task instructions here. Be specific. define "Success Verification" criteria.

2.  **Run the Loop**:
    Open Git Bash in this folder and run:
    ```bash
    ./loop.sh
    ```

3.  **Watch it Go**:
    The script will:
    *   Read `PROMPT.md`
    *   Send it to Ralphy
    *   Check if Ralphy output "DONE"
    *   Repeat up to 10 times

## Tips
*   **Iteration:** Don't expect perfection on run #1. The loop allows Ralphy to try, fail, and fix.
*   **Safety:** The loop stops after 10 iterations (you can edit `loop.sh` to change this).
*   **Context:** Ralphy runs in the *current* folder context, but has access to the whole project if configured. Here, it will mostly modify files in `ralph_sandbox` unless you specify otherwise in the prompt.

## Example Prompts
*   "Refactor `file.js` to use arrow functions."
*   "Write unit tests for `auth.js` until all pass."
*   "Create a new component `Button.jsx`."
