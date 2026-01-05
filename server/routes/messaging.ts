import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import { db } from "../db.js";
import { conversations, messages, socialAccounts } from "../../shared/schema.js";
import { eq, desc, and } from "drizzle-orm";

export function registerMessagingRoutes(app: Express): void {
  app.get("/api/inbox", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const allConversations = await db.select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.lastMessageAt));
      
      res.json(allConversations);
    } catch (error) {
      console.error("Error fetching inbox:", error);
      res.status(500).json({ error: "Failed to fetch inbox" });
    }
  });

  app.get("/api/conversations/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      
      const [conversation] = await db.select()
        .from(conversations)
        .where(and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        ));
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      const messagesList = await db.select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);
      
      res.json({ conversation, messages: messagesList });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations/:id/reply", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      const { content, useAI } = req.body;
      
      const [conversation] = await db.select()
        .from(conversations)
        .where(and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        ));
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      const [newMessage] = await db.insert(messages).values({
        conversationId,
        direction: "outgoing",
        content,
        messageType: "text",
        isAiGenerated: useAI || false,
        status: "pending",
      }).returning();
      
      await db.update(conversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      
      res.json(newMessage);
    } catch (error) {
      console.error("Error sending reply:", error);
      res.status(500).json({ error: "Failed to send reply" });
    }
  });

  app.post("/api/conversations/:id/ai-status", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id);
      const { aiStatus } = req.body;
      
      await db.update(conversations)
        .set({ aiStatus, updatedAt: new Date() })
        .where(and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        ));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating AI status:", error);
      res.status(500).json({ error: "Failed to update AI status" });
    }
  });
}
