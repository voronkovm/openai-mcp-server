#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import OpenAI from "openai";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs/promises';
import path from 'path';

const CustomErrorCode = {
  InvalidApiKey: 1000,
  InvalidImageFile: 1001,
  UnsupportedImageType: 1002
} as const;

const OPENAI_API_KEY = process.env.OPENAI_MCP_API_KEY;
if (!OPENAI_API_KEY) {
  throw new McpError(CustomErrorCode.InvalidApiKey, "OPENAI_MCP_API_KEY environment variable is required");
}
if (!OPENAI_API_KEY.startsWith("sk-")) {
  throw new McpError(CustomErrorCode.InvalidApiKey, "Invalid OpenAI API key format");
}

const OPENAI_MODEL = process.env.OPENAI_MCP_MODEL;
if (!OPENAI_MODEL) {
  throw new McpError(CustomErrorCode.InvalidApiKey, "OPENAI_MCP_MODEL environment variable is required");
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const SUPPORTED_IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif']);

async function imageToDataURL(imagePath: string): Promise<string> {
  try {
    const ext = path.extname(imagePath).toLowerCase().slice(1);
    if (!SUPPORTED_IMAGE_TYPES.has(ext)) {
      throw new McpError(CustomErrorCode.UnsupportedImageType, `Unsupported image type: ${ext}`);
    }

    const imageData = await fs.readFile(imagePath);
    const base64 = imageData.toString('base64');
    return `data:image/${ext};base64,${base64}`;
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(CustomErrorCode.InvalidImageFile, `Failed to read image file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

class OpenAIServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "openai-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "chat",
          description: "Maintains ongoing conversations with OpenAI. Creates new chats or continues existing ones with full history context.",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The message to send to OpenAI"
              },
              imagePath: {
                type: "string",
                description: "Optional: Path to image file to include (supports png/jpg/gif)"
              }
            },
            required: ["message"]
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          
          case "chat": {
            const { message, imagePath } = request.params.arguments as { 
              message: string;
              imagePath?: string;
            };

            const contentParts: OpenAI.ChatCompletionContentPart[] = [
              { type: "text", text: message }
            ];

            if (imagePath) {
              const dataUrl = await imageToDataURL(imagePath);
              contentParts.push({
                type: "image_url",
                image_url: { url: dataUrl }
              });
            }

            const response = await openai.chat.completions.create({
              model: process.env.OPENAI_MCP_MODEL ?? "gpt-4o",
              messages: [{
                role: "user",
                content: contentParts
              }],
            });

            return {
              content: [{
                type: "text",
                text: response.choices[0].message.content ?? ""
              }]
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof Error) {
          throw new McpError(
            ErrorCode.InternalError,
            `OpenAI API error: ${error.message}`
          );
        }
        throw new McpError(
          ErrorCode.InternalError,
          "Unknown OpenAI API error occurred"
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenAI MCP server running on stdio");
  }
}

const server = new OpenAIServer();
server.run().catch(console.error);
