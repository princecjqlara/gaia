# Ralph Wiggum Sandbox

This directory contains a sandbox for the "Ralph Wiggum" iterative AI development technique.

## Structure
- `ralph-loop.js`: The main Node.js script that runs the loop.
- `PROMPT.md`: The template file where you define your task and prompt for the AI.

## Usage

1. **Edit `PROMPT.md`**: Define your task, requirements, and most importantly, the **Completion Promise** (default is "DONE").
2. **Run the Loop**:
   
   ```bash
   node ralph-loop.js --command "your-ai-step-command"
   ```

   **Example with a mock command:**
   ```bash
   node ralph-loop.js --command "echo 'Working... needs more work'" --completed-promise "DONE"
   ```

   **Example with a real AI CLI (e.g., assuming `claude` CLI is installed and accepts stdin):**
   ```bash
   node ralph-loop.js --command "claude"
   ```

## Options
- `--prompt <file>`: Path to the prompt file (default: `PROMPT.md`).
- `--command <cmd>`: The command to execute in each iteration (default: `echo "Simulating run..."`).
- `--max-iterations <n>`: Stop after N iterations (default: `10`).
- `--completion-promise <text>`: The string to look for in stdout to stop the loop (default: `DONE`).

## Philosophy
"Ralph is a Bash loop". We keep feeding the prompt to the agent until it says it's done. Failures are data. Persistence wins.
