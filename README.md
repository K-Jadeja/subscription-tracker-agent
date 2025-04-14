# Mastra Subscription Tracker

A Telegram bot that helps users track and manage their subscriptions by analyzing their Gmail for receipts and storing the data in Supabase.

## Features

- Connects to user's Gmail to find subscription receipts
- Extracts key information like service name, amount, billing date, and frequency
- Creates a neatly organized table of all subscriptions
- Calculates total monthly and annual subscription costs
- Stores subscription data in Supabase for future reference

## Prerequisites

- Node.js (v16+)
- npm or pnpm
- Telegram Bot Token (from BotFather)
- Gmail and Supabase MCP API access (from Composio)
- Supabase account 

## Environment Variables

Create a `.env.development` file in the root directory with the following variables:

```
OPENAI_API_KEY=your_openai_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Composio MCP URLs
COMPOSIO_MCP_GMAIL=https://your-gmail-mcp-url.com
COMPOSIO_MCP_SUPABASE=https://your-supabase-mcp-url.com
```

## Installation

```bash
# Install dependencies
npm install
```

## Running the Bot

```bash
# Start the playground
npm run dev
```
That's it! Give the repo a star or follow me on [twitter](https://x.com/krsnalyst) where I make AI frameworks more accessible for non-technical founders

Check out [mastra](https://github.com/mastra-ai/mastra)
