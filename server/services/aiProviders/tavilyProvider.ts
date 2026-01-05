import type { AIProvider, AIMessage, AIProviderResponse, GenerateOptions, AIModel } from "./index.js";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const TAVILY_BASE_URL = process.env.TAVILY_BASE_URL || "https://api.tavily.com";

const models: AIModel[] = [
  { id: "search", name: "Web Search", description: "Real-time web search", default: true },
  { id: "search-deep", name: "Deep Search", description: "Comprehensive web search with more results" },
];

export const tavilyProvider: AIProvider = {
  id: "tavily",
  name: "Tavily Search",
  description: "Real-time web search powered by AI",
  icon: "🔍",
  capabilities: ["search"],
  models,

  async generate(messages: AIMessage[], options: GenerateOptions): Promise<AIProviderResponse> {
    try {
      if (!TAVILY_API_KEY) {
        throw new Error("TAVILY_API_KEY is not configured");
      }

      const lastMessage = messages.filter((m) => m.role === "user").pop();
      if (!lastMessage) {
        throw new Error("No search query provided");
      }

      const query = lastMessage.content;
      const isDeep = options.model === "search-deep";
      const limit = isDeep ? 10 : 5;

      const response = await fetch(`${TAVILY_BASE_URL}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TAVILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          search_depth: isDeep ? "advanced" : "basic",
          max_results: limit,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      let content = "";
      
      if (data.answer) {
        content += `**Summary:**\n${data.answer}\n\n`;
      }

      if (data.results && data.results.length > 0) {
        content += "**Sources:**\n";
        data.results.forEach((result: any, index: number) => {
          content += `\n${index + 1}. **${result.title || "Untitled"}**\n`;
          content += `   ${result.content || result.snippet || ""}\n`;
          content += `   [Read more](${result.url})\n`;
        });
      }

      return {
        content: content || "No results found for your search.",
        type: "search",
        metadata: {
          query,
          resultCount: data.results?.length || 0,
          sources: data.results?.map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content || r.snippet,
          })),
        },
      };
    } catch (error: any) {
      console.error("Tavily provider error:", error);
      return {
        content: "",
        type: "search",
        error: error.message || "Web search failed",
      };
    }
  },

  isConfigured(): boolean {
    return !!TAVILY_API_KEY;
  },
};
