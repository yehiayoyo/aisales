import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import { db } from "../db.js";
import { socialAccounts, conversations, messages, autoReplyRules, scheduledPosts } from "../../shared/schema.js";
import { eq, count, desc, and, gte } from "drizzle-orm";

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/stats", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const [accountsCount] = await db.select({ count: count() })
        .from(socialAccounts)
        .where(eq(socialAccounts.userId, userId));
      
      const [conversationsCount] = await db.select({ count: count() })
        .from(conversations)
        .where(eq(conversations.userId, userId));
      
      const [messagesThisWeek] = await db.select({ count: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(
          eq(conversations.userId, userId),
          gte(messages.createdAt, weekAgo)
        ));
      
      const [pendingPosts] = await db.select({ count: count() })
        .from(scheduledPosts)
        .where(and(
          eq(scheduledPosts.userId, userId),
          eq(scheduledPosts.status, "pending")
        ));

      res.json({
        connectedAccounts: accountsCount?.count || 0,
        totalConversations: conversationsCount?.count || 0,
        messagesThisWeek: messagesThisWeek?.count || 0,
        pendingPosts: pendingPosts?.count || 0,
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/dashboard/recent-conversations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      const recentConversations = await db.select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(10);
      
      res.json(recentConversations);
    } catch (error) {
      console.error("Recent conversations error:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/auto-reply/rules", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      const rules = await db.select()
        .from(autoReplyRules)
        .where(eq(autoReplyRules.userId, userId));
      
      res.json(rules);
    } catch (error) {
      console.error("Auto-reply rules error:", error);
      res.status(500).json({ error: "Failed to fetch rules" });
    }
  });

  app.post("/api/auto-reply/rules", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { name, mode, triggerKeywords, responseTemplate, aiPrompt, socialAccountId } = req.body;
      
      const [rule] = await db.insert(autoReplyRules).values({
        userId,
        name,
        mode: mode || "ai_suggested",
        triggerKeywords,
        responseTemplate,
        aiPrompt,
        socialAccountId,
        isEnabled: true,
      }).returning();
      
      res.json(rule);
    } catch (error) {
      console.error("Create rule error:", error);
      res.status(500).json({ error: "Failed to create rule" });
    }
  });

  app.get("/api/scheduled-posts", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      const posts = await db.select()
        .from(scheduledPosts)
        .where(eq(scheduledPosts.userId, userId))
        .orderBy(scheduledPosts.scheduledFor);
      
      res.json(posts);
    } catch (error) {
      console.error("Scheduled posts error:", error);
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  });

  app.post("/api/scheduled-posts", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { content, socialAccountId, scheduledFor, mediaUrls } = req.body;
      
      const [post] = await db.insert(scheduledPosts).values({
        userId,
        socialAccountId,
        content,
        scheduledFor: new Date(scheduledFor),
        mediaUrls,
        status: "pending",
      }).returning();
      
      res.json(post);
    } catch (error) {
      console.error("Create post error:", error);
      res.status(500).json({ error: "Failed to schedule post" });
    }
  });
}
