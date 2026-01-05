export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
  type?: "text" | "image" | "video" | "search";
  metadata?: Record<string, any>;
}

export interface AIProviderResponse {
  content: string;
  type: "text" | "image" | "video" | "search";
  metadata?: Record<string, any>;
  error?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: ("text" | "image" | "video" | "search")[];
  models: AIModel[];
  generate(
    messages: AIMessage[],
    options: GenerateOptions
  ): Promise<AIProviderResponse>;
  isConfigured(): boolean;
}

export interface AIModel {
  id: string;
  name: string;
  description?: string;
  default?: boolean;
}

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  useWebSearch?: boolean;
  aspectRatio?: string;
  duration?: number;
  width?: number;
  height?: number;
}

import { openaiProvider } from "./openaiProvider.js";
import { lumaProvider } from "./lumaProvider.js";
import { tavilyProvider } from "./tavilyProvider.js";

const providers: Map<string, AIProvider> = new Map();

export function registerProvider(provider: AIProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): AIProvider | undefined {
  return providers.get(id);
}

export function getAllProviders(): AIProvider[] {
  return Array.from(providers.values());
}

export function getConfiguredProviders(): AIProvider[] {
  return getAllProviders().filter((p) => p.isConfigured());
}

registerProvider(openaiProvider);
registerProvider(lumaProvider);
registerProvider(tavilyProvider);

export { openaiProvider, lumaProvider, tavilyProvider };
