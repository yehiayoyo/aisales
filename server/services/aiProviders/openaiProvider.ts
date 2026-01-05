import OpenAI from "openai";
import type { AIProvider, AIMessage, AIProviderResponse, GenerateOptions, AIModel } from "./index.js";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const models: AIModel[] = [
  { id: "gpt-4o", name: "GPT-4o", description: "Most capable model, best for complex tasks", default: true },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and efficient for simpler tasks" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: "High capability with faster responses" },
  { id: "o1-preview", name: "O1 Preview", description: "Advanced reasoning model" },
  { id: "o1-mini", name: "O1 Mini", description: "Efficient reasoning model" },
];

export const openaiProvider: AIProvider = {
  id: "openai",
  name: "ChatGPT",
  description: "OpenAI's powerful language models for text generation and conversation",
  icon: "🤖",
  capabilities: ["text"],
  models,

  async generate(messages: AIMessage[], options: GenerateOptions): Promise<AIProviderResponse> {
    try {
      const modelId = options.model || "gpt-4o";
      const temperature = options.temperature ?? 0.7;
      const maxTokens = options.maxTokens ?? 2048;

      const formattedMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await openai.chat.completions.create({
        model: modelId,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens,
      });

      const content = response.choices[0]?.message?.content || "I couldn't generate a response.";

      return {
        content,
        type: "text",
        metadata: {
          model: modelId,
          usage: response.usage,
          finishReason: response.choices[0]?.finish_reason,
        },
      };
    } catch (error: any) {
      console.error("OpenAI provider error:", error);
      return {
        content: "",
        type: "text",
        error: error.message || "OpenAI request failed",
      };
    }
  },

  isConfigured(): boolean {
    return !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  },
};
