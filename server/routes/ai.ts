import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export function registerAIRoutes(app: Express): void {
  app.post("/api/ai/generate-reply", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { message, platform, context, tone } = req.body;
      
      const systemPrompt = `You are an AI assistant for MT Hub, helping businesses respond to customer messages.
Platform: ${platform || "general"}
Tone: ${tone || "professional and friendly"}
Context: ${context || "customer support"}

Generate a helpful, concise reply that:
- Addresses the customer's inquiry directly
- Maintains the specified tone
- Is appropriate for the platform (shorter for WhatsApp, can be longer for Facebook)
- Encourages further engagement when appropriate`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        max_completion_tokens: 500,
      });

      res.json({
        reply: response.choices[0].message.content,
        confidence: 85,
      });
    } catch (error) {
      console.error("AI reply error:", error);
      res.status(500).json({ error: "Failed to generate reply" });
    }
  });

  app.post("/api/ai/generate-content", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { type, topic, platform, style, keywords } = req.body;
      
      let prompt = "";
      switch (type) {
        case "post":
          prompt = `Create a ${platform || "social media"} post about: ${topic}
Style: ${style || "engaging and professional"}
Keywords to include: ${keywords?.join(", ") || "none specified"}
Include relevant emojis and hashtags.`;
          break;
        case "caption":
          prompt = `Write a compelling caption for: ${topic}
Platform: ${platform || "Instagram"}
Style: ${style || "catchy and engaging"}
Include relevant hashtags.`;
          break;
        case "ad":
          prompt = `Create ad copy for: ${topic}
Platform: ${platform || "Facebook"}
Style: ${style || "persuasive and action-oriented"}
Include a clear call-to-action.`;
          break;
        default:
          prompt = `Create content about: ${topic}`;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "You are a social media content expert. Create engaging, platform-appropriate content that drives engagement and conversions." 
          },
          { role: "user", content: prompt }
        ],
        max_completion_tokens: 800,
      });

      res.json({
        content: response.choices[0].message.content,
        type,
        platform,
      });
    } catch (error) {
      console.error("Content generation error:", error);
      res.status(500).json({ error: "Failed to generate content" });
    }
  });

  app.post("/api/ai/analyze-sentiment", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { message } = req.body;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "Analyze the sentiment of the following message. Return JSON with: sentiment (positive/negative/neutral), confidence (0-100), keywords (array), intent (inquiry/complaint/purchase/general)." 
          },
          { role: "user", content: message }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 200,
      });

      const analysis = JSON.parse(response.choices[0].message.content || "{}");
      res.json(analysis);
    } catch (error) {
      console.error("Sentiment analysis error:", error);
      res.status(500).json({ error: "Failed to analyze sentiment" });
    }
  });
}
