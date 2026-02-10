#!/bin/bash

# ==========================================
# The Ralph Wiggum Loop
# "Iteration > Perfection"
# ==========================================

PROMPT_FILE="PROMPT.md"
MAX_ITERATIONS=10
ITERATION=1

echo "🍌 Starting Ralph Loop..."
echo "Target: $PROMPT_FILE"

# Load API Key if not set (from parent .env)
if [ -z "$RALPHY_API_KEY" ]; then
    if [ -f "../.env" ]; then
        echo "Loading API Key from ../.env..."
        export RALPHY_API_KEY=$(grep RALPHY_API_KEY ../.env | cut -d '=' -f2 | tr -d '\r')
    fi
fi

if [ -z "$RALPHY_API_KEY" ]; then
    echo "❌ Error: RALPHY_API_KEY not found. Please check your .env file."
    exit 1
fi

while [ $ITERATION -le $MAX_ITERATIONS ]; do
    echo ""
    echo "🔄 Iteration $ITERATION / $MAX_ITERATIONS"
    echo "----------------------------------------"
    
    # Read the prompt
    TASK_CONTENT=$(cat $PROMPT_FILE)
    
    # Run Ralphy with the prompt
    # We append a system instruction to output "DONE" if complete.
    ralphy "$TASK_CONTENT. If the task is 100% complete and verified, output the exact word 'DONE' at the end." > ralphy_output.txt 2>&1
    
    # Capture exit code and output
    EXIT_CODE=$?
    OUTPUT=$(cat ralphy_output.txt)
    echo "$OUTPUT"
    
    # Check for "DONE" signal
    if echo "$OUTPUT" | grep -q "DONE"; then
        echo ""
        echo "✅ Task Completed! Ralph says 'I'm a helper!'"
        break
    fi
    
    # Check for hard failure
    if [ $EXIT_CODE -ne 0 ]; then
        echo "⚠️  Ralphy encountered an error (Code $EXIT_CODE). Retrying..."
    fi

    ITERATION=$((ITERATION+1))
    
    # Safety pause
    sleep 2
done

if [ $ITERATION -gt $MAX_ITERATIONS ]; then
    echo ""
    echo "🛑 Max iterations reached. Loop stopped."
fi
