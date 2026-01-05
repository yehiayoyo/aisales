import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import {
  createChat,
  getChat,
  getUserChats,
  deleteChat,
  getChatMessages,
  sendMessage,
  updateChatTitle,
  getAvailableProviders,
} from "../services/aiChatService.js";

export function registerAIChatRoutes(app: Express): void {
  app.get("/api/ai-chat/providers", isAuthenticated, async (req: any, res: Response) => {
    try {
      const providers = getAvailableProviders();
      res.json(providers);
    } catch (error) {
      console.error("Error fetching providers:", error);
      res.status(500).json({ error: "Failed to fetch providers" });
    }
  });

  app.get("/api/ai-chat/chats", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const chats = await getUserChats(userId);
      res.json(chats);
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    }
  });

  app.post("/api/ai-chat/chats", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { providerId, model, title } = req.body;

      if (!providerId) {
        return res.status(400).json({ error: "Provider ID is required" });
      }

      const chat = await createChat(userId, providerId, model, title);
      res.json(chat);
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(500).json({ error: "Failed to create chat" });
    }
  });

  app.get("/api/ai-chat/chats/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);

      const chat = await getChat(chatId, userId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      const messages = await getChatMessages(chatId);
      res.json({ chat, messages });
    } catch (error) {
      console.error("Error fetching chat:", error);
      res.status(500).json({ error: "Failed to fetch chat" });
    }
  });

  app.delete("/api/ai-chat/chats/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);

      const success = await deleteChat(chatId, userId);
      if (!success) {
        return res.status(404).json({ error: "Chat not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting chat:", error);
      res.status(500).json({ error: "Failed to delete chat" });
    }
  });

  app.patch("/api/ai-chat/chats/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);
      const { title } = req.body;

      const chat = await getChat(chatId, userId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      if (title) {
        await updateChatTitle(chatId, title);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating chat:", error);
      res.status(500).json({ error: "Failed to update chat" });
    }
  });

  app.post("/api/ai-chat/chats/:id/messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const chatId = parseInt(req.params.id);
      const { content, providerId, model, options } = req.body;

      if (!content) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const chat = await getChat(chatId, userId);
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      const effectiveProviderId = providerId || chat.providerId;
      const result = await sendMessage(chatId, userId, content, effectiveProviderId, {
        model: model || chat.model,
        ...options,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  });

  app.post("/api/ai-chat/quick", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { content, providerId, model, options } = req.body;

      if (!content || !providerId) {
        return res.status(400).json({ error: "Content and provider ID are required" });
      }

      const chat = await createChat(userId, providerId, model);
      const result = await sendMessage(chat.id, userId, content, providerId, {
        model,
        ...options,
      });

      res.json({
        chat,
        ...result,
      });
    } catch (error: any) {
      console.error("Error in quick chat:", error);
      res.status(500).json({ error: error.message || "Failed to process request" });
    }
  });
}
