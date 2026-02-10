---
description: Run the Ralph Wiggum iterative loop with a specified prompt.
---

1.  **Get the Prompt**: Extract the prompt text from the user's request.
2.  **Update Prompt File**: Overwrite `ralph/PROMPT.md` with the extracted prompt.
    - Ensure the completion criteria (e.g., "Output <promise>DONE</promise> when finished") is included or appended to the prompt if missing.
3.  **Run Loop**: Execute the Ralph loop script.
    - Command: `npm run ralph -- --command "claude"` (or the user's preferred AI CLI command).
    - // turbo
4.  **Monitor**: Watch the output and report back to the user when completed or if it gets stuck.
