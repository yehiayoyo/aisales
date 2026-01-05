import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import { generateAIReply, generateContent, analyzeSentiment, getToneProfiles, clearConversationMemory } from "../services/aiService.js";

export function registerAIRoutes(app: Express): void {
  app.post("/api/ai/generate-reply", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { message, conversationId, tone } = req.body;
      const userId = req.user.claims.sub;
      
      const reply = await generateAIReply(
        message,
        [],
        userId,
        tone || "professional",
        conversationId
      );

      res.json({
        reply,
        confidence: 85,
      });
    } catch (error) {
      console.error("AI reply error:", error);
      res.status(500).json({ error: "Failed to generate reply" });
    }
  });

  app.post("/api/ai/generate-content", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { type, topic, platform, tone } = req.body;
      
      const content = await generateContent(type, platform, topic, tone);

      res.json({
        content,
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
      
      const analysis = await analyzeSentiment(message);
      res.json(analysis);
    } catch (error) {
      console.error("Sentiment analysis error:", error);
      res.status(500).json({ error: "Failed to analyze sentiment" });
    }
  });

  app.get("/api/ai/tone-profiles", isAuthenticated, async (req: any, res: Response) => {
    try {
      const profiles = getToneProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching tone profiles:", error);
      res.status(500).json({ error: "Failed to fetch tone profiles" });
    }
  });

  app.post("/api/ai/clear-memory", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { conversationId } = req.body;
      const userId = req.user.claims.sub;
      
      clearConversationMemory(userId, conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing memory:", error);
      res.status(500).json({ error: "Failed to clear memory" });
    }
  });
}
