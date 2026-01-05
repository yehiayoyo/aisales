import { sql, relations } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, boolean, jsonb, serial } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const socialAccounts = pgTable("social_accounts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  platformAccountId: varchar("platform_account_id").notNull(),
  accountName: varchar("account_name"),
  accountType: varchar("account_type", { length: 50 }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  pageAccessToken: text("page_access_token"),
  permissions: jsonb("permissions").$type<string[]>(),
  metadata: jsonb("metadata"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const socialAccountsRelations = relations(socialAccounts, ({ one }) => ({
  user: one(users, {
    fields: [socialAccounts.userId],
    references: [users.id],
  }),
}));

export const autoReplyRules = pgTable("auto_reply_rules", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  socialAccountId: serial("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  mode: varchar("mode", { length: 20 }).default("ai_suggested"),
  triggerKeywords: jsonb("trigger_keywords").$type<string[]>(),
  responseTemplate: text("response_template"),
  aiPrompt: text("ai_prompt"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scheduledPosts = pgTable("scheduled_posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  socialAccountId: serial("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  mediaUrls: jsonb("media_urls").$type<string[]>(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  publishedAt: timestamp("published_at"),
  platformPostId: varchar("platform_post_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertSocialAccount = typeof socialAccounts.$inferInsert;
export type AutoReplyRule = typeof autoReplyRules.$inferSelect;
export type InsertAutoReplyRule = typeof autoReplyRules.$inferInsert;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type InsertScheduledPost = typeof scheduledPosts.$inferInsert;
