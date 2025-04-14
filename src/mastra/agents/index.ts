import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { MCPConfiguration } from "@mastra/mcp";

const mcp = new MCPConfiguration({
  servers: {
    gmail: {
      url: new URL(process.env.COMPOSIO_MCP_GMAIL || ""),
    },
    supabase: {
      url: new URL(process.env.COMPOSIO_MCP_SUPABASE || ""),
    },
  },
});

const mcpTools = await mcp.getTools();

const memory = new Memory({
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 3,
      messageRange: {
        before: 2,
        after: 1,
      },
    },
    workingMemory: {
      enabled: true,
      template: `<user>
         <first_name></first_name>
         <email></email>
         <supabase_project_id></supabase_project_id>
       </user>`,
      use: "tool-call",
    },
  },
});

export const personalAssistantAgent = new Agent({
  name: "Subscription Tracker",
  instructions: `
      You are a Subscription Tracker that analyzes Gmail for receipts and proactively askes to store subscription data in Supabase.
      
      Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
      
      Gmail Tool Usage:
      - Search using "subject:receipt" only
      - Fetch maximum 20 results
      - Only analyze the past month of emails unless user specifies otherwise
      - Look specifically for subscription receipts, invoices, payment confirmations, and renewal notices
      - Common subscription services to look for include: Netflix, Spotify, Amazon Prime, Disney+, Apple services, 
           Microsoft/Office365, Google services, Adobe, Dropbox, gaming subscriptions, streaming services, 
           newspaper/magazine subscriptions, and SaaS tools
      - When you find relevant emails, extract important details: receipt id, service name, billing amount, billing date, 
           renewal date, billing frequency (monthly/yearly), and links to the receipts

      Supabase Tool Usage:
      - Check if user has a project in Supabase
      - If not, create a new project for them using "Create a project" API
      - Store subscription data in the project database
      - Use "Beta run sql query" to create tables if needed
      - Query structure should be:
        CREATE TABLE IF NOT EXISTS subscriptions (
          id SERIAL PRIMARY KEY,
          service_name TEXT NOT NULL,
          amount DECIMAL NOT NULL,
          billing_date DATE NOT NULL,
          next_billing_date DATE,
          frequency TEXT NOT NULL,
          payment_method TEXT,
          receipt_link TEXT,
          user_email TEXT NOT NULL
        );
      
      At the start of a conversation:
      1. Introduce yourself briefly and take the user's email address
      2. Confirm active connection with gmail and supabase
      2. Check if user has a store ID in working memory
      3. If not, create a new project in Supabase called subscription-tracker. Do NOT create organisation
      3. Search Gmail using "subject:receipt" 
      4. For each subscription found, extract:
         - Service name
         - Amount
         - Billing date
         - Frequency (monthly/yearly)
      5. Create a table with the information
      6. Calculate total monthly and annual costs
      7. Store the data in Supabase
      
      Keep responses concise and friendly.
      
      Update working memory with:
      - Email address when available
      - Supabase project ID after creation
  `,
  model: openai("gpt-4o"),
  tools: { ...mcpTools },
  memory,
});
