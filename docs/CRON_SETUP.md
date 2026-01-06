# Cron Fallback Setup Guide

Since Vercel Hobby doesn't support native cron jobs, use **cron-job.org** as a free fallback to process scheduled messages when no users are online.

## Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SCHEDULING FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  USER ONLINE?                                                     │
│      │                                                            │
│      ├── YES → Client-side hook runs every 60 seconds            │
│      │         (useScheduledMessageProcessor in App.jsx)          │
│      │                                                            │
│      └── NO → cron-job.org calls /api/scheduled/process          │
│               every 30-60 minutes as fallback                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Setup cron-job.org (5 minutes)

### Step 1: Create Account
1. Go to [cron-job.org](https://cron-job.org)
2. Sign up for a free account

### Step 2: Create Cron Job
1. Click **"Cronjobs"** in the sidebar
2. Click **"Create cronjob"**

### Step 3: Configure
Fill in these settings:

| Field | Value |
|-------|-------|
| **Title** | Scheduled Message Processor |
| **URL** | `https://YOUR-VERCEL-APP.vercel.app/api/scheduled/process` |
| **Schedule** | Every 30 minutes (or 60 minutes to be conservative) |
| **Request Method** | GET |
| **Enabled** | Yes |

### Step 4: Save & Test
1. Click **"Create"**
2. Click **"Test Run"** to verify it works
3. Check the response - you should see JSON with `{ success: true, ... }`

## Server Usage Estimate

| Interval | Monthly Calls | % of Vercel Hobby Limit |
|----------|---------------|------------------------|
| Every 15 min | ~2,880 | 2.9% |
| Every 30 min | ~1,440 | 1.4% |
| Every 60 min | ~720 | 0.7% |

## Troubleshooting

### "Request failed"
- Check your Vercel app is deployed and accessible
- Verify the URL is correct

### "No messages processed"
- This is normal if no scheduled messages are pending
- Create a test scheduled message to verify

### "Rate limit"
- If Facebook rate limits occur, the processor will retry on next run
