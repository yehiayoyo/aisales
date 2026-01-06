import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import { generateAIReply, generateContent, analyzeSentiment, getToneProfiles, clearConversationMemory, generateCampaignPosts } from "../services/aiService.js";
import { db } from "../db.js";
import { scheduledPosts } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

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

  // Generate and schedule AI campaign posts for a product
  app.post("/api/ai/generate-campaign", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { 
        productName, 
        productDescription, 
        platform, 
        tone, 
        numberOfPosts, 
        startDate, 
        socialAccountId,
        postTypes 
      } = req.body;

      if (!productName || !numberOfPosts || !startDate) {
        return res.status(400).json({ error: "Product name, number of posts, and start date are required" });
      }

      // Generate posts using AI
      const posts = await generateCampaignPosts({
        productName,
        productDescription: productDescription || productName,
        platform: platform || "general",
        tone: tone || "professional",
        numberOfPosts: Math.min(numberOfPosts, 30), // Max 30 posts
        postTypes: postTypes || ["post", "story", "ad"]
      });

      // Schedule each post
      const scheduledItems = [];
      const start = new Date(startDate);
      
      for (let i = 0; i < posts.length; i++) {
        const postDate = new Date(start);
        postDate.setDate(postDate.getDate() + Math.floor(i / 2)); // 2 posts per day
        postDate.setHours(9 + (i % 2) * 6, 0, 0, 0); // 9AM and 3PM

        const [scheduled] = await db.insert(scheduledPosts).values({
          userId,
          socialAccountId: socialAccountId || null,
          content: posts[i].content,
          scheduledFor: postDate,
          status: "pending",
        }).returning();

        scheduledItems.push({
          ...scheduled,
          postType: posts[i].type
        });
      }

      res.json({
        success: true,
        campaign: {
          productName,
          totalPosts: scheduledItems.length,
          startDate: start,
          endDate: new Date(start.getTime() + (Math.ceil(posts.length / 2) - 1) * 24 * 60 * 60 * 1000),
        },
        posts: scheduledItems
      });
    } catch (error) {
      console.error("Campaign generation error:", error);
      res.status(500).json({ error: "Failed to generate campaign" });
    }
  });

  // Get scheduled posts with delete and edit capability
  app.delete("/api/scheduled-posts/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const postId = parseInt(req.params.id);
      
      await db.delete(scheduledPosts).where(
        eq(scheduledPosts.id, postId)
      );
      
      res.json({ success: true });
    } catch (error) {
      console.error("Delete post error:", error);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // Update scheduled post
  app.patch("/api/scheduled-posts/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const postId = parseInt(req.params.id);
      const { content, scheduledFor, status } = req.body;
      
      const updates: any = { updatedAt: new Date() };
      if (content) updates.content = content;
      if (scheduledFor) updates.scheduledFor = new Date(scheduledFor);
      if (status) updates.status = status;
      
      const [updated] = await db.update(scheduledPosts)
        .set(updates)
        .where(eq(scheduledPosts.id, postId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Update post error:", error);
      res.status(500).json({ error: "Failed to update post" });
    }
  });
}
