import TelegramBot from "node-telegram-bot-api";
import { personalAssistantAgent } from "../agents";

export class TelegramIntegration {
  private bot: TelegramBot;
  private readonly MAX_MESSAGE_LENGTH = 4096; // Telegram's message length limit
  private readonly MAX_RESULT_LENGTH = 500; // Maximum length for tool results

  constructor(token: string) {
    // Create a bot instance
    this.bot = new TelegramBot(token, { polling: true });

    // Handle incoming messages
    this.bot.on("message", this.handleMessage.bind(this));
  }

  private escapeMarkdownV2(text: string): string {
    // Escape only characters that need escaping in MarkdownV2
    // These are: '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'
    return text.replace(/([_*[\]()~`>#+=|{}.!\\])/g, "\\$1");
  }

  private isMarkdownFormatted(text: string): boolean {
    // Check if text already contains Markdown formatting
    return (
      /[*_~`]/.test(text) ||
      text.includes("```") ||
      /\[.*\]\(.*\)/.test(text) ||
      (text.includes("|") && text.includes("-") && /\|.*\|/.test(text))
    );
  }

  private formatMarkdownTable(data: any[]): string {
    if (!data || data.length === 0) return "";

    // Extract headers from the first object
    const headers = Object.keys(data[0]);

    // Create header row
    let table = "| " + headers.join(" | ") + " |\n";

    // Create separator row
    table += "| " + headers.map(() => "---").join(" | ") + " |\n";

    // Create data rows
    for (const row of data) {
      table +=
        "| " + headers.map((header) => row[header] || "").join(" | ") + " |\n";
    }

    return table;
  }

  private truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "... [truncated]";
  }

  private formatToolResult(result: any): string {
    try {
      // Check if result is an array of objects (potential table data)
      if (
        Array.isArray(result) &&
        result.length > 0 &&
        typeof result[0] === "object"
      ) {
        return this.formatMarkdownTable(result);
      }

      // Otherwise format as JSON
      const jsonString = JSON.stringify(result, null, 2);
      return (
        "```json\n" +
        this.truncateString(jsonString, this.MAX_RESULT_LENGTH) +
        "\n```"
      );
    } catch (error) {
      return `[Complex data structure - ${typeof result}]`;
    }
  }

  private async updateOrSplitMessage(
    chatId: number,
    messageId: number | undefined,
    text: string
  ): Promise<number> {
    // Handle empty text
    if (!text.trim()) {
      return messageId || 0;
    }

    // If the text already contains markdown formatting, don't escape it
    let processedText = this.isMarkdownFormatted(text) ? text : text;

    // If text is within limits, try to update existing message
    if (processedText.length <= this.MAX_MESSAGE_LENGTH && messageId) {
      try {
        await this.bot.editMessageText(processedText, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "MarkdownV2",
        });
        return messageId;
      } catch (error) {
        console.error("Error updating message:", error);
        // If markdown fails, try sending without markdown
        try {
          await this.bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
          });
          return messageId;
        } catch (fallbackError) {
          console.error("Fallback error:", fallbackError);
        }
      }
    }

    // If text is too long or update failed, send as new message
    try {
      const newMessage = await this.bot.sendMessage(chatId, processedText, {
        parse_mode: "MarkdownV2",
      });
      return newMessage.message_id;
    } catch (error) {
      console.error("Error sending markdown message:", error);
      // If markdown fails, try sending without markdown
      try {
        const fallbackMsg = await this.bot.sendMessage(chatId, text);
        return fallbackMsg.message_id;
      } catch (fallbackError) {
        // If all else fails, truncate and send without formatting
        console.error("Final fallback error:", fallbackError);
        const truncated =
          text.substring(0, this.MAX_MESSAGE_LENGTH - 100) +
          "\n\n... [Message truncated due to length]";
        const lastResortMsg = await this.bot.sendMessage(chatId, truncated);
        return lastResortMsg.message_id;
      }
    }
  }

  private async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const username = msg.from?.username || "unknown";
    const firstName = msg.from?.first_name || "unknown";
    const userId = msg.from?.id.toString() || `anonymous-${chatId}`;

    if (!text) {
      await this.bot.sendMessage(
        chatId,
        "Sorry, I can only process text messages."
      );
      return;
    }

    try {
      // Send initial message
      const sentMessage = await this.bot.sendMessage(chatId, "Thinking...");
      let currentResponse = "";
      let lastUpdate = Date.now();
      let currentMessageId = sentMessage.message_id;
      const UPDATE_INTERVAL = 500; // Update every 500ms to avoid rate limits

      // Stream response using the agent
      const stream = await personalAssistantAgent.stream(text, {
        threadId: `telegram-${chatId}`, // Use chat ID as thread ID
        resourceId: userId, // Use user ID as resource ID
        context: [
          {
            role: "system",
            content: `Current user: ${firstName} (${username})`,
          },
        ],
      });

      // Process the full stream
      for await (const chunk of stream.fullStream) {
        let shouldUpdate = false;
        let chunkText = "";

        switch (chunk.type) {
          case "text-delta":
            chunkText = chunk.textDelta;
            shouldUpdate = true;
            break;

          case "tool-call":
            const formattedArgs = JSON.stringify(chunk.args, null, 2);
            chunkText = `\n🛠️ *Using tool*: ${chunk.toolName}\n\`\`\`json\n${formattedArgs}\n\`\`\`\n`;
            console.log(`Tool call: ${chunk.toolName}`, chunk.args);
            shouldUpdate = false; // Changed to true to show tool calls
            break;

          case "tool-result":
            const formattedResult = this.formatToolResult(chunk.result);
            chunkText = `✨ *Result*:\n${formattedResult}\n`;
            console.log("Tool result:", chunk.result);
            shouldUpdate = false; // Changed to true to show tool results
            break;

          case "error":
            chunkText = `\n❌ *Error*: ${String(chunk.error)}\n`;
            console.error("Error:", chunk.error);
            shouldUpdate = true;
            break;

          case "reasoning":
            chunkText = `\n💭 ${chunk.textDelta}\n`;
            console.log("Reasoning:", chunk.textDelta);
            shouldUpdate = true;
            break;
        }

        if (shouldUpdate) {
          currentResponse += chunkText;
          const now = Date.now();
          if (now - lastUpdate >= UPDATE_INTERVAL) {
            try {
              currentMessageId = await this.updateOrSplitMessage(
                chatId,
                currentMessageId,
                currentResponse
              );
              lastUpdate = now;
            } catch (error) {
              console.error("Error updating/splitting message:", error);
            }
          }
        }
      }

      // Final update
      await this.updateOrSplitMessage(
        chatId,
        currentMessageId,
        currentResponse
      );
    } catch (error) {
      console.error("Error processing message:", error);
      await this.bot.sendMessage(
        chatId,
        "Sorry, I encountered an error processing your message. Please try again."
      );
    }
  }
}
