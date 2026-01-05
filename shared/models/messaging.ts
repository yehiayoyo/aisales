import { sql, relations } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, boolean, jsonb, serial, integer } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { socialAccounts } from "./social";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  socialAccountId: integer("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  externalConversationId: varchar("external_conversation_id"),
  contactName: varchar("contact_name"),
  contactId: varchar("contact_id"),
  contactProfileUrl: varchar("contact_profile_url"),
  status: varchar("status", { length: 20 }).default("open"),
  aiStatus: varchar("ai_status", { length: 20 }).default("auto"),
  lastMessageAt: timestamp("last_message_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  direction: varchar("direction", { length: 10 }).notNull(),
  content: text("content"),
  messageType: varchar("message_type", { length: 20 }).default("text"),
  externalMessageId: varchar("external_message_id"),
  senderName: varchar("sender_name"),
  senderId: varchar("sender_id"),
  isAiGenerated: boolean("is_ai_generated").default(false),
  aiConfidence: integer("ai_confidence"),
  status: varchar("status", { length: 20 }).default("delivered"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  socialAccount: one(socialAccounts, {
    fields: [conversations.socialAccountId],
    references: [socialAccounts.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
