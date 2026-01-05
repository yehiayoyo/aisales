import { relations } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, boolean, jsonb, serial, integer, decimal } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const creatorProfiles = pgTable("creator_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name").notNull(),
  bio: text("bio"),
  portfolioUrl: varchar("portfolio_url"),
  platforms: jsonb("platforms").$type<string[]>().default([]),
  contentTypes: jsonb("content_types").$type<string[]>().default([]),
  niches: jsonb("niches").$type<string[]>().default([]),
  ratePerVideo: decimal("rate_per_video", { precision: 10, scale: 2 }),
  ratePerImage: decimal("rate_per_image", { precision: 10, scale: 2 }),
  isAvailable: boolean("is_available").default(true),
  completedProjects: integer("completed_projects").default(0),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ugcCampaigns = pgTable("ugc_campaigns", {
  id: serial("id").primaryKey(),
  brandUserId: varchar("brand_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  description: text("description"),
  contentType: varchar("content_type", { length: 50 }).notNull(),
  platform: varchar("platform", { length: 50 }).notNull(),
  tone: varchar("tone", { length: 50 }),
  style: text("style"),
  talkingPoints: jsonb("talking_points").$type<string[]>(),
  hookIdeas: jsonb("hook_ideas").$type<string[]>(),
  productInfo: text("product_info"),
  productImages: jsonb("product_images").$type<string[]>(),
  deadline: timestamp("deadline"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  usageRights: varchar("usage_rights", { length: 100 }),
  usageDuration: varchar("usage_duration", { length: 50 }),
  usageRightsDetails: jsonb("usage_rights_details").$type<{
    platforms: string[];
    duration: string;
    exclusivity: boolean;
    paidAds: boolean;
    territory: string;
  }>(),
  requiresNda: boolean("requires_nda").default(false),
  ndaText: text("nda_text"),
  status: varchar("status", { length: 30 }).default("draft"),
  isOpenRequest: boolean("is_open_request").default(false),
  aiBrief: text("ai_brief"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const campaignAssignments = pgTable("campaign_assignments", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => ugcCampaigns.id, { onDelete: "cascade" }),
  creatorId: integer("creator_id").notNull().references(() => creatorProfiles.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 30 }).default("pending"),
  agreedRate: decimal("agreed_rate", { precision: 10, scale: 2 }),
  notes: text("notes"),
  ndaAccepted: boolean("nda_accepted").default(false),
  ndaAcceptedAt: timestamp("nda_accepted_at"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  completedAt: timestamp("completed_at"),
});

export const contentSubmissions = pgTable("content_submissions", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => campaignAssignments.id, { onDelete: "cascade" }),
  version: integer("version").default(1),
  fileType: varchar("file_type", { length: 20 }),
  fileName: varchar("file_name"),
  filePath: varchar("file_path"),
  fileSize: integer("file_size"),
  thumbnailPath: varchar("thumbnail_path"),
  watermarkedPath: varchar("watermarked_path"),
  isWatermarked: boolean("is_watermarked").default(true),
  downloadUnlocked: boolean("download_unlocked").default(false),
  caption: text("caption"),
  duration: integer("duration"),
  aiQualityScore: integer("ai_quality_score"),
  aiQualityNotes: jsonb("ai_quality_notes").$type<{ length?: string; structure?: string; engagement?: string }>(),
  status: varchar("status", { length: 30 }).default("submitted"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const contentReviews = pgTable("content_reviews", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => contentSubmissions.id, { onDelete: "cascade" }),
  reviewerUserId: varchar("reviewer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  decision: varchar("decision", { length: 20 }).notNull(),
  feedback: text("feedback"),
  aiFeedbackSuggestion: text("ai_feedback_suggestion"),
  revisionRequests: jsonb("revision_requests").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ugcMessages = pgTable("ugc_messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => ugcCampaigns.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  attachmentPath: varchar("attachment_path"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const creatorProfilesRelations = relations(creatorProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [creatorProfiles.userId],
    references: [users.id],
  }),
  assignments: many(campaignAssignments),
}));

export const ugcCampaignsRelations = relations(ugcCampaigns, ({ one, many }) => ({
  brand: one(users, {
    fields: [ugcCampaigns.brandUserId],
    references: [users.id],
  }),
  assignments: many(campaignAssignments),
  messages: many(ugcMessages),
}));

export const campaignAssignmentsRelations = relations(campaignAssignments, ({ one, many }) => ({
  campaign: one(ugcCampaigns, {
    fields: [campaignAssignments.campaignId],
    references: [ugcCampaigns.id],
  }),
  creator: one(creatorProfiles, {
    fields: [campaignAssignments.creatorId],
    references: [creatorProfiles.id],
  }),
  submissions: many(contentSubmissions),
}));

export const contentSubmissionsRelations = relations(contentSubmissions, ({ one, many }) => ({
  assignment: one(campaignAssignments, {
    fields: [contentSubmissions.assignmentId],
    references: [campaignAssignments.id],
  }),
  reviews: many(contentReviews),
}));

export const contentReviewsRelations = relations(contentReviews, ({ one }) => ({
  submission: one(contentSubmissions, {
    fields: [contentReviews.submissionId],
    references: [contentSubmissions.id],
  }),
  reviewer: one(users, {
    fields: [contentReviews.reviewerUserId],
    references: [users.id],
  }),
}));

export const ugcMessagesRelations = relations(ugcMessages, ({ one }) => ({
  campaign: one(ugcCampaigns, {
    fields: [ugcMessages.campaignId],
    references: [ugcCampaigns.id],
  }),
  sender: one(users, {
    fields: [ugcMessages.senderId],
    references: [users.id],
  }),
}));

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type InsertCreatorProfile = typeof creatorProfiles.$inferInsert;
export type UgcCampaign = typeof ugcCampaigns.$inferSelect;
export type InsertUgcCampaign = typeof ugcCampaigns.$inferInsert;
export type CampaignAssignment = typeof campaignAssignments.$inferSelect;
export type InsertCampaignAssignment = typeof campaignAssignments.$inferInsert;
export type ContentSubmission = typeof contentSubmissions.$inferSelect;
export type InsertContentSubmission = typeof contentSubmissions.$inferInsert;
export type ContentReview = typeof contentReviews.$inferSelect;
export type InsertContentReview = typeof contentReviews.$inferInsert;
export type UgcMessage = typeof ugcMessages.$inferSelect;
export type InsertUgcMessage = typeof ugcMessages.$inferInsert;
