#!/usr/bin/env node

/**
 * Ralph Wiggum Loop Script (GLM Version)
 * 
 * Executes AI prompts repeatedly until a completion promise is met or max iterations are reached.
 * Uses NVIDIA GLM API directly - no external CLI required.
 * 
 * Usage:
 * node ralph-loop.js --prompt <file> --max-iterations <n> --completion-promise "<text>"
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

// Parse arguments
const args = process.argv.slice(2);
const getConfig = (key) => {
    const index = args.indexOf(key);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
};

let promptFile = getConfig('--prompt');
if (!promptFile) {
    if (fs.existsSync('PROMPT.md')) {
        promptFile = 'PROMPT.md';
    } else if (fs.existsSync(path.join('ralph', 'PROMPT.md'))) {
        promptFile = path.join('ralph', 'PROMPT.md');
    } else {
        promptFile = 'PROMPT.md';
    }
}

const maxIterations = parseInt(getConfig('--max-iterations') || '30', 10);
const completionPromise = getConfig('--completion-promise') || 'DONE';
const model = getConfig('--model') || 'meta/llama-3.1-70b-instruct';

// Get API key from environment
const apiKey = process.env.NVIDIA_API_KEY || process.env.RALPHY_API_KEY;

if (!apiKey) {
    console.error('❌ Error: No API key found. Set NVIDIA_API_KEY or RALPHY_API_KEY in your .env file.');
    process.exit(1);
}

console.log(`
🚀 Starting Ralph Wiggum Loop (GLM Mode)
--------------------------------
Prompt File: ${promptFile}
Model: ${model}
Max Iterations: ${maxIterations}
Completion Promise: "${completionPromise}"
API: NVIDIA GLM ✓
--------------------------------
`);

if (!fs.existsSync(promptFile)) {
    console.error(`❌ Error: Prompt file '${promptFile}' not found.`);
    process.exit(1);
}

const promptContent = fs.readFileSync(promptFile, 'utf8');
let iteration = 1;
let conversationHistory = [];

async function callGLM(messages) {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: 4096,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function runIteration() {
    if (iteration > maxIterations) {
        console.log(`\n🛑 Max iterations (${maxIterations}) reached. Stopping.`);
        process.exit(0);
    }

    console.log(`\n[Iteration ${iteration}/${maxIterations}] Calling GLM...`);

    try {
        // Build messages - first iteration uses the prompt, subsequent ones continue the conversation
        if (iteration === 1) {
            conversationHistory.push({
                role: 'user',
                content: promptContent
            });
        } else {
            conversationHistory.push({
                role: 'user',
                content: 'Continue working on the task. Remember to output "DONE" when fully completed.'
            });
        }

        const aiResponse = await callGLM(conversationHistory);

        // Add AI response to history
        conversationHistory.push({
            role: 'assistant',
            content: aiResponse
        });

        // Print the response
        console.log('\n--- GLM Response ---');
        console.log(aiResponse);
        console.log('--- End Response ---\n');

        // Check for completion promise
        if (aiResponse.includes(completionPromise)) {
            console.log(`\n✅ Completion promise "${completionPromise}" found!`);
            console.log('Ralph loop finished successfully.');

            // Save output
            const outputDir = 'ralph_sandbox';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            fs.writeFileSync(
                path.join(outputDir, 'ralphy_output.txt'),
                conversationHistory.map(m => `[${m.role}]\n${m.content}`).join('\n\n---\n\n')
            );
            console.log(`📝 Output saved to ${outputDir}/ralphy_output.txt`);

            process.exit(0);
        } else {
            console.log(`⚠️  Iteration ${iteration} finished. Promise not found. Continuing...`);
            iteration++;
            // Small delay to avoid rate limiting
            setTimeout(runIteration, 2000);
        }
    } catch (error) {
        console.error(`\n❌ Error in iteration ${iteration}: ${error.message}`);
        console.log('Retrying in 5 seconds...');
        setTimeout(runIteration, 5000);
    }
}

runIteration();
