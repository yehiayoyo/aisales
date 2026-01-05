import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { eq, and, desc, or, isNull, inArray } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import {
  generateAIBrief,
  generateScriptAssistance,
  generateHookSuggestions,
  analyzeContentQuality,
  generateRevisionFeedback,
} from "../services/ugcAiService.js";
import { generateUgcVideo, isLumaConfigured } from "../services/lumaAiService.js";

const {
  creatorProfiles,
  ugcCampaigns,
  campaignAssignments,
  contentSubmissions,
  contentReviews,
  ugcMessages,
  ugcOrders,
  ugcDeliveries,
} = schema;

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/ugc");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only images and videos are allowed"));
  },
});

router.get("/creator/profile", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      return res.json({ exists: false });
    }
    res.json({ exists: true, profile: profile[0] });
  } catch (error) {
    console.error("Error fetching creator profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.post("/creator/profile", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { displayName, bio, portfolioUrl, platforms, contentTypes, niches, ratePerVideo, ratePerImage } = req.body;

    const existing = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(creatorProfiles)
        .set({
          displayName,
          bio,
          portfolioUrl,
          platforms,
          contentTypes,
          niches,
          ratePerVideo,
          ratePerImage,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.id, existing[0].id))
        .returning();
      return res.json(updated);
    }

    const [profile] = await db.insert(creatorProfiles).values({
      userId,
      displayName,
      bio,
      portfolioUrl,
      platforms,
      contentTypes,
      niches,
      ratePerVideo,
      ratePerImage,
    }).returning();

    res.json(profile);
  } catch (error) {
    console.error("Error creating/updating creator profile:", error);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

router.get("/creators", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { platform, contentType, niche } = req.query;
    
    let creators = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.isAvailable, true))
      .orderBy(desc(creatorProfiles.rating));

    if (platform && typeof platform === "string") {
      creators = creators.filter(c => 
        (c.platforms as string[])?.includes(platform)
      );
    }
    if (contentType && typeof contentType === "string") {
      creators = creators.filter(c => 
        (c.contentTypes as string[])?.includes(contentType)
      );
    }
    if (niche && typeof niche === "string") {
      creators = creators.filter(c => 
        (c.niches as string[])?.includes(niche)
      );
    }

    res.json(creators);
  } catch (error) {
    console.error("Error fetching creators:", error);
    res.status(500).json({ error: "Failed to fetch creators" });
  }
});

router.post("/campaigns", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      title,
      description,
      contentType,
      platform,
      tone,
      style,
      productInfo,
      deadline,
      budget,
      usageRights,
      usageDuration,
      isOpenRequest,
    } = req.body;

    const [campaign] = await db.insert(ugcCampaigns).values({
      brandUserId: userId,
      title,
      description,
      contentType,
      platform,
      tone,
      style,
      productInfo,
      deadline: deadline ? new Date(deadline) : undefined,
      budget,
      usageRights,
      usageDuration,
      isOpenRequest: isOpenRequest || false,
      status: "draft",
    }).returning();

    res.json(campaign);
  } catch (error) {
    console.error("Error creating campaign:", error);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.get("/campaigns", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { role } = req.query;

    if (role === "creator") {
      const profile = await db.select().from(creatorProfiles)
        .where(eq(creatorProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        return res.json([]);
      }

      const assignments = await db.select({
        assignment: campaignAssignments,
        campaign: ugcCampaigns,
      })
        .from(campaignAssignments)
        .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
        .where(eq(campaignAssignments.creatorId, profile[0].id));

      const openCampaigns = await db.select().from(ugcCampaigns)
        .where(and(
          eq(ugcCampaigns.isOpenRequest, true),
          eq(ugcCampaigns.status, "open")
        ));

      return res.json({
        assigned: assignments,
        openRequests: openCampaigns,
      });
    }

    const campaigns = await db.select().from(ugcCampaigns)
      .where(eq(ugcCampaigns.brandUserId, userId))
      .orderBy(desc(ugcCampaigns.createdAt));

    res.json(campaigns);
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.get("/campaigns/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const campaign = await db.select().from(ugcCampaigns)
      .where(eq(ugcCampaigns.id, campaignId))
      .limit(1);

    if (campaign.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const assignments = await db.select({
      assignment: campaignAssignments,
      creator: creatorProfiles,
    })
      .from(campaignAssignments)
      .leftJoin(creatorProfiles, eq(campaignAssignments.creatorId, creatorProfiles.id))
      .where(eq(campaignAssignments.campaignId, campaignId));

    res.json({
      ...campaign[0],
      assignments,
    });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.post("/campaigns/:id/generate-brief", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const campaign = await db.select().from(ugcCampaigns)
      .where(and(
        eq(ugcCampaigns.id, campaignId),
        eq(ugcCampaigns.brandUserId, userId)
      ))
      .limit(1);

    if (campaign.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const result = await generateAIBrief({
      contentType: campaign[0].contentType,
      platform: campaign[0].platform,
      tone: campaign[0].tone || undefined,
      style: campaign[0].style || undefined,
      productInfo: campaign[0].productInfo || undefined,
      description: campaign[0].description || undefined,
    });

    await db.update(ugcCampaigns)
      .set({
        aiBrief: result.brief,
        talkingPoints: result.talkingPoints,
        hookIdeas: result.hookIdeas,
        updatedAt: new Date(),
      })
      .where(eq(ugcCampaigns.id, campaignId));

    res.json(result);
  } catch (error) {
    console.error("Error generating AI brief:", error);
    res.status(500).json({ error: "Failed to generate AI brief" });
  }
});

router.post("/campaigns/:id/publish", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const [updated] = await db.update(ugcCampaigns)
      .set({ status: "open", updatedAt: new Date() })
      .where(and(
        eq(ugcCampaigns.id, campaignId),
        eq(ugcCampaigns.brandUserId, userId)
      ))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error publishing campaign:", error);
    res.status(500).json({ error: "Failed to publish campaign" });
  }
});

router.post("/campaigns/:id/assign", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { creatorId, agreedRate, notes } = req.body;

    const campaign = await db.select().from(ugcCampaigns)
      .where(and(
        eq(ugcCampaigns.id, campaignId),
        eq(ugcCampaigns.brandUserId, userId)
      ))
      .limit(1);

    if (campaign.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const [assignment] = await db.insert(campaignAssignments).values({
      campaignId,
      creatorId,
      agreedRate,
      notes,
      status: "pending",
    }).returning();

    await db.update(ugcCampaigns)
      .set({ status: "assigned", updatedAt: new Date() })
      .where(eq(ugcCampaigns.id, campaignId));

    res.json(assignment);
  } catch (error) {
    console.error("Error assigning creator:", error);
    res.status(500).json({ error: "Failed to assign creator" });
  }
});

router.post("/assignments/:id/accept", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      return res.status(403).json({ error: "Creator profile required" });
    }

    const [updated] = await db.update(campaignAssignments)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
      })
      .where(and(
        eq(campaignAssignments.id, assignmentId),
        eq(campaignAssignments.creatorId, profile[0].id)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    await db.update(ugcCampaigns)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(ugcCampaigns.id, updated.campaignId));

    res.json(updated);
  } catch (error) {
    console.error("Error accepting assignment:", error);
    res.status(500).json({ error: "Failed to accept assignment" });
  }
});

router.post("/assignments/:id/submit", isAuthenticated, upload.single("file"), async (req: Request, res: Response) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { caption, duration } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "File required" });
    }

    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      return res.status(403).json({ error: "Creator profile required" });
    }

    const assignment = await db.select({
      assignment: campaignAssignments,
      campaign: ugcCampaigns,
    })
      .from(campaignAssignments)
      .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
      .where(and(
        eq(campaignAssignments.id, assignmentId),
        eq(campaignAssignments.creatorId, profile[0].id)
      ))
      .limit(1);

    if (assignment.length === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    const existingSubmissions = await db.select().from(contentSubmissions)
      .where(eq(contentSubmissions.assignmentId, assignmentId));
    const version = existingSubmissions.length + 1;

    const qualityAnalysis = await analyzeContentQuality(
      assignment[0].campaign.contentType,
      assignment[0].campaign.platform,
      duration ? parseInt(duration) : undefined,
      caption
    );

    const [submission] = await db.insert(contentSubmissions).values({
      assignmentId,
      version,
      fileType: file.mimetype.startsWith("video") ? "video" : "image",
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      caption,
      duration: duration ? parseInt(duration) : undefined,
      aiQualityScore: qualityAnalysis.score,
      aiQualityNotes: qualityAnalysis.notes,
      status: "submitted",
    }).returning();

    await db.update(campaignAssignments)
      .set({ status: "submitted" })
      .where(eq(campaignAssignments.id, assignmentId));

    await db.update(ugcCampaigns)
      .set({ status: "review", updatedAt: new Date() })
      .where(eq(ugcCampaigns.id, assignment[0].campaign.id));

    res.json(submission);
  } catch (error) {
    console.error("Error submitting content:", error);
    res.status(500).json({ error: "Failed to submit content" });
  }
});

router.get("/assignments/:id/submissions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const assignmentId = parseInt(req.params.id);

    const submissions = await db.select().from(contentSubmissions)
      .where(eq(contentSubmissions.assignmentId, assignmentId))
      .orderBy(desc(contentSubmissions.version));

    res.json(submissions);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

router.post("/submissions/:id/review", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const submissionId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { decision, feedback, revisionRequests } = req.body;

    const submission = await db.select({
      submission: contentSubmissions,
      assignment: campaignAssignments,
      campaign: ugcCampaigns,
    })
      .from(contentSubmissions)
      .innerJoin(campaignAssignments, eq(contentSubmissions.assignmentId, campaignAssignments.id))
      .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
      .where(eq(contentSubmissions.id, submissionId))
      .limit(1);

    if (submission.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (submission[0].campaign.brandUserId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    let aiFeedbackSuggestion = null;
    if (decision === "revision_requested") {
      aiFeedbackSuggestion = await generateRevisionFeedback(
        submission[0].campaign.aiBrief || submission[0].campaign.description || "",
        submission[0].submission.caption || undefined
      );
    }

    const [review] = await db.insert(contentReviews).values({
      submissionId,
      reviewerUserId: userId,
      decision,
      feedback,
      aiFeedbackSuggestion,
      revisionRequests,
    }).returning();

    if (decision === "approved") {
      await db.update(contentSubmissions)
        .set({ status: "approved", downloadUnlocked: true, approvedAt: new Date() })
        .where(eq(contentSubmissions.id, submissionId));

      await db.update(campaignAssignments)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(campaignAssignments.id, submission[0].assignment.id));

      await db.update(ugcCampaigns)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(ugcCampaigns.id, submission[0].campaign.id));

      await db.update(creatorProfiles)
        .set({
          completedProjects: (submission[0].assignment.creatorId || 0) + 1,
        })
        .where(eq(creatorProfiles.id, submission[0].assignment.creatorId));
    } else if (decision === "revision_requested") {
      await db.update(contentSubmissions)
        .set({ status: "revision_requested" })
        .where(eq(contentSubmissions.id, submissionId));

      await db.update(campaignAssignments)
        .set({ status: "revision_requested" })
        .where(eq(campaignAssignments.id, submission[0].assignment.id));
    }

    res.json({ review, aiFeedbackSuggestion });
  } catch (error) {
    console.error("Error reviewing submission:", error);
    res.status(500).json({ error: "Failed to review submission" });
  }
});

router.post("/ai/script", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { contentType, platform, productInfo, tone } = req.body;

    const script = await generateScriptAssistance(
      contentType,
      platform,
      productInfo,
      tone || "authentic"
    );

    res.json({ script });
  } catch (error) {
    console.error("Error generating script:", error);
    res.status(500).json({ error: "Failed to generate script" });
  }
});

router.post("/ai/hooks", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { productInfo, platform } = req.body;

    const hooks = await generateHookSuggestions(productInfo, platform);

    res.json({ hooks });
  } catch (error) {
    console.error("Error generating hooks:", error);
    res.status(500).json({ error: "Failed to generate hooks" });
  }
});

router.get("/campaigns/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);

    const messages = await db.select().from(ugcMessages)
      .where(eq(ugcMessages.campaignId, campaignId))
      .orderBy(ugcMessages.createdAt);

    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/campaigns/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { content } = req.body;

    const [message] = await db.insert(ugcMessages).values({
      campaignId,
      senderId: userId,
      content,
    }).returning();

    res.json(message);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/submissions/:id/download", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const submissionId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const submission = await db.select({
      submission: contentSubmissions,
      assignment: campaignAssignments,
      campaign: ugcCampaigns,
    })
      .from(contentSubmissions)
      .innerJoin(campaignAssignments, eq(contentSubmissions.assignmentId, campaignAssignments.id))
      .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
      .where(eq(contentSubmissions.id, submissionId))
      .limit(1);

    if (submission.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (submission[0].campaign.brandUserId !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (!submission[0].submission.downloadUnlocked) {
      return res.status(403).json({ 
        error: "Content download is locked until final approval",
        status: submission[0].submission.status,
        isWatermarked: submission[0].submission.isWatermarked
      });
    }

    const filePath = submission[0].submission.filePath;
    if (!filePath) {
      return res.status(404).json({ error: "File not found" });
    }

    res.download(filePath, submission[0].submission.fileName || "content");
  } catch (error) {
    console.error("Error downloading content:", error);
    res.status(500).json({ error: "Failed to download content" });
  }
});

router.post("/assignments/:id/accept-nda", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      return res.status(403).json({ error: "Creator profile required" });
    }

    const assignment = await db.select({
      assignment: campaignAssignments,
      campaign: ugcCampaigns,
    })
      .from(campaignAssignments)
      .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
      .where(and(
        eq(campaignAssignments.id, assignmentId),
        eq(campaignAssignments.creatorId, profile[0].id)
      ))
      .limit(1);

    if (assignment.length === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    if (!assignment[0].campaign.requiresNda) {
      return res.status(400).json({ error: "This campaign does not require NDA" });
    }

    const [updated] = await db.update(campaignAssignments)
      .set({
        ndaAccepted: true,
        ndaAcceptedAt: new Date(),
      })
      .where(eq(campaignAssignments.id, assignmentId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error accepting NDA:", error);
    res.status(500).json({ error: "Failed to accept NDA" });
  }
});

router.get("/dashboard/stats", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const campaigns = await db.select().from(ugcCampaigns)
      .where(eq(ugcCampaigns.brandUserId, userId));

    const activeRequests = campaigns.filter(c => 
      ["open", "assigned", "in_progress"].includes(c.status || "")
    ).length;

    const pendingReviews = campaigns.filter(c => c.status === "review").length;
    const completed = campaigns.filter(c => c.status === "completed").length;
    const drafts = campaigns.filter(c => c.status === "draft").length;

    const campaignIds = campaigns.map(c => c.id);
    let totalSubmissions = 0;
    let approvedSubmissions = 0;

    if (campaignIds.length > 0) {
      const assignments = await db.select().from(campaignAssignments)
        .where(inArray(campaignAssignments.campaignId, campaignIds));
      
      const assignmentIds = assignments.map(a => a.id);
      if (assignmentIds.length > 0) {
        const submissions = await db.select().from(contentSubmissions)
          .where(inArray(contentSubmissions.assignmentId, assignmentIds));
        totalSubmissions = submissions.length;
        approvedSubmissions = submissions.filter(s => s.status === "approved").length;
      }
    }

    res.json({
      activeRequests,
      pendingReviews,
      completed,
      drafts,
      totalCampaigns: campaigns.length,
      totalSubmissions,
      approvedSubmissions,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/dashboard/review-history", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const reviews = await db.select({
      review: contentReviews,
      submission: contentSubmissions,
      assignment: campaignAssignments,
      campaign: ugcCampaigns,
    })
      .from(contentReviews)
      .innerJoin(contentSubmissions, eq(contentReviews.submissionId, contentSubmissions.id))
      .innerJoin(campaignAssignments, eq(contentSubmissions.assignmentId, campaignAssignments.id))
      .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
      .where(eq(contentReviews.reviewerUserId, userId))
      .orderBy(desc(contentReviews.createdAt))
      .limit(50);

    res.json(reviews);
  } catch (error) {
    console.error("Error fetching review history:", error);
    res.status(500).json({ error: "Failed to fetch review history" });
  }
});

router.get("/dashboard/approved-library", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const approvedContent = await db.select({
      submission: contentSubmissions,
      assignment: campaignAssignments,
      campaign: ugcCampaigns,
      creator: creatorProfiles,
    })
      .from(contentSubmissions)
      .innerJoin(campaignAssignments, eq(contentSubmissions.assignmentId, campaignAssignments.id))
      .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
      .innerJoin(creatorProfiles, eq(campaignAssignments.creatorId, creatorProfiles.id))
      .where(and(
        eq(ugcCampaigns.brandUserId, userId),
        eq(contentSubmissions.status, "approved")
      ))
      .orderBy(desc(contentSubmissions.approvedAt));

    const library = approvedContent.map(item => ({
      id: item.submission.id,
      fileName: item.submission.fileName,
      fileType: item.submission.fileType,
      caption: item.submission.caption,
      approvedAt: item.submission.approvedAt,
      downloadUnlocked: item.submission.downloadUnlocked,
      campaignTitle: item.campaign.title,
      campaignId: item.campaign.id,
      platform: item.campaign.platform,
      contentType: item.campaign.contentType,
      usageRights: item.campaign.usageRights,
      usageRightsDetails: item.campaign.usageRightsDetails,
      usageDuration: item.campaign.usageDuration,
      creatorName: item.creator.displayName,
    }));

    res.json(library);
  } catch (error) {
    console.error("Error fetching approved library:", error);
    res.status(500).json({ error: "Failed to fetch approved library" });
  }
});

router.get("/dashboard/creator-status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const campaigns = await db.select().from(ugcCampaigns)
      .where(eq(ugcCampaigns.brandUserId, userId));

    const campaignIds = campaigns.map(c => c.id);
    if (campaignIds.length === 0) {
      return res.json([]);
    }

    const assignments = await db.select({
      assignment: campaignAssignments,
      creator: creatorProfiles,
      campaign: ugcCampaigns,
    })
      .from(campaignAssignments)
      .innerJoin(creatorProfiles, eq(campaignAssignments.creatorId, creatorProfiles.id))
      .innerJoin(ugcCampaigns, eq(campaignAssignments.campaignId, ugcCampaigns.id))
      .where(inArray(campaignAssignments.campaignId, campaignIds));

    const creatorStatus = assignments.map(item => ({
      assignmentId: item.assignment.id,
      creatorId: item.creator.id,
      creatorName: item.creator.displayName,
      campaignId: item.campaign.id,
      campaignTitle: item.campaign.title,
      status: item.assignment.status,
      ndaAccepted: item.assignment.ndaAccepted,
      assignedAt: item.assignment.assignedAt,
      acceptedAt: item.assignment.acceptedAt,
      completedAt: item.assignment.completedAt,
    }));

    res.json(creatorStatus);
  } catch (error) {
    console.error("Error fetching creator status:", error);
    res.status(500).json({ error: "Failed to fetch creator status" });
  }
});

router.post("/orders", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const buyerUserId = (req as any).user?.id;
    const { campaignId, creatorId, amount, requirements } = req.body;

    if (!campaignId || !creatorId) {
      return res.status(400).json({ error: "Campaign and creator are required" });
    }

    const platformFee = amount ? (parseFloat(amount) * 0.1).toFixed(2) : "0";

    const [order] = await db.insert(ugcOrders).values({
      campaignId,
      buyerUserId,
      creatorId,
      amount,
      platformFee,
      requirements: requirements || [],
      status: "unpaid",
    }).returning();

    res.json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.get("/orders", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { role } = req.query;

    if (role === "creator") {
      const profile = await db.select().from(creatorProfiles)
        .where(eq(creatorProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0) {
        return res.json([]);
      }

      const orders = await db.select({
        order: ugcOrders,
        campaign: ugcCampaigns,
      })
        .from(ugcOrders)
        .innerJoin(ugcCampaigns, eq(ugcOrders.campaignId, ugcCampaigns.id))
        .where(eq(ugcOrders.creatorId, profile[0].id))
        .orderBy(desc(ugcOrders.createdAt));

      return res.json(orders);
    }

    const orders = await db.select({
      order: ugcOrders,
      campaign: ugcCampaigns,
      creator: creatorProfiles,
    })
      .from(ugcOrders)
      .innerJoin(ugcCampaigns, eq(ugcOrders.campaignId, ugcCampaigns.id))
      .innerJoin(creatorProfiles, eq(ugcOrders.creatorId, creatorProfiles.id))
      .where(eq(ugcOrders.buyerUserId, userId))
      .orderBy(desc(ugcOrders.createdAt));

    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.get("/orders/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const [order] = await db.select({
      order: ugcOrders,
      campaign: ugcCampaigns,
      creator: creatorProfiles,
    })
      .from(ugcOrders)
      .innerJoin(ugcCampaigns, eq(ugcOrders.campaignId, ugcCampaigns.id))
      .innerJoin(creatorProfiles, eq(ugcOrders.creatorId, creatorProfiles.id))
      .where(eq(ugcOrders.id, orderId))
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const creatorProfile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    const isCreator = creatorProfile.length > 0 && creatorProfile[0].id === order.creator.id;
    const isBuyer = order.order.buyerUserId === userId;

    if (!isCreator && !isBuyer) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deliveries = await db.select().from(ugcDeliveries)
      .where(eq(ugcDeliveries.orderId, orderId))
      .orderBy(desc(ugcDeliveries.deliveredAt));

    res.json({ ...order, deliveries, userRole: isCreator ? "creator" : "buyer" });
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

router.post("/orders/:id/pay", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { paymentId } = req.body;

    const [order] = await db.select().from(ugcOrders)
      .where(and(eq(ugcOrders.id, orderId), eq(ugcOrders.buyerUserId, userId)));

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "unpaid") {
      return res.status(400).json({ error: "Order already paid" });
    }

    const [updated] = await db.update(ugcOrders)
      .set({
        status: "paid",
        paymentId: paymentId || `pay_${Date.now()}`,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ugcOrders.id, orderId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ error: "Failed to process payment" });
  }
});

router.post("/orders/:id/start", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      return res.status(403).json({ error: "Creator profile required" });
    }

    const [order] = await db.select().from(ugcOrders)
      .where(and(eq(ugcOrders.id, orderId), eq(ugcOrders.creatorId, profile[0].id)));

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "paid") {
      return res.status(400).json({ error: "Order must be paid first" });
    }

    const [updated] = await db.update(ugcOrders)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(ugcOrders.id, orderId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error starting order:", error);
    res.status(500).json({ error: "Failed to start order" });
  }
});

router.post("/orders/:id/deliver", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { videoUrl, note, submissionId } = req.body;

    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    if (profile.length === 0) {
      return res.status(403).json({ error: "Creator profile required" });
    }

    const [order] = await db.select().from(ugcOrders)
      .where(and(eq(ugcOrders.id, orderId), eq(ugcOrders.creatorId, profile[0].id)));

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!["paid", "in_progress"].includes(order.status || "")) {
      return res.status(400).json({ error: "Cannot deliver in current status" });
    }

    if (!videoUrl) {
      return res.status(400).json({ error: "Video URL required" });
    }

    const [delivery] = await db.insert(ugcDeliveries).values({
      orderId,
      submissionId: submissionId || null,
      videoUrl,
      note: note || "",
      status: "pending",
    }).returning();

    await db.update(ugcOrders)
      .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(ugcOrders.id, orderId));

    await db.insert(ugcMessages).values({
      campaignId: order.campaignId,
      orderId,
      senderId: userId,
      senderRole: "creator",
      content: `📦 Delivery submitted\n🔗 ${videoUrl}\n📝 ${note || "No notes"}`,
      messageType: "delivery",
    });

    res.json(delivery);
  } catch (error) {
    console.error("Error delivering order:", error);
    res.status(500).json({ error: "Failed to deliver order" });
  }
});

router.post("/orders/:id/approve", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const [order] = await db.select().from(ugcOrders)
      .where(and(eq(ugcOrders.id, orderId), eq(ugcOrders.buyerUserId, userId)));

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "delivered") {
      return res.status(400).json({ error: "Order not delivered yet" });
    }

    const latestDelivery = await db.select().from(ugcDeliveries)
      .where(eq(ugcDeliveries.orderId, orderId))
      .orderBy(desc(ugcDeliveries.deliveredAt))
      .limit(1);

    if (latestDelivery.length > 0) {
      await db.update(ugcDeliveries)
        .set({ status: "approved", approvedAt: new Date() })
        .where(eq(ugcDeliveries.id, latestDelivery[0].id));
    }

    const [updated] = await db.update(ugcOrders)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(ugcOrders.id, orderId))
      .returning();

    await db.insert(ugcMessages).values({
      campaignId: order.campaignId,
      orderId,
      senderId: userId,
      senderRole: "buyer",
      content: "✅ Video approved and order completed",
      messageType: "system",
    });

    res.json(updated);
  } catch (error) {
    console.error("Error approving order:", error);
    res.status(500).json({ error: "Failed to approve order" });
  }
});

router.post("/orders/:id/revision", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { note, failedRequirement } = req.body;

    const [order] = await db.select().from(ugcOrders)
      .where(and(eq(ugcOrders.id, orderId), eq(ugcOrders.buyerUserId, userId)));

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "delivered") {
      return res.status(400).json({ error: "Order not delivered" });
    }

    if (!note) {
      return res.status(400).json({ error: "Revision note required" });
    }

    const assignments = await db.select().from(campaignAssignments)
      .where(eq(campaignAssignments.orderId, orderId))
      .limit(1);

    if (assignments.length > 0) {
      const assignment = assignments[0];

      if (!failedRequirement) {
        const revisionsAllowed = assignment.revisionsAllowed || 3;
        const revisionsUsed = assignment.revisionsUsed || 0;

        if (revisionsUsed >= revisionsAllowed) {
          return res.status(403).json({ error: "No revisions left" });
        }

        await db.update(campaignAssignments)
          .set({ revisionsUsed: revisionsUsed + 1 })
          .where(eq(campaignAssignments.id, assignment.id));
      }
    }

    const latestDelivery = await db.select().from(ugcDeliveries)
      .where(eq(ugcDeliveries.orderId, orderId))
      .orderBy(desc(ugcDeliveries.deliveredAt))
      .limit(1);

    if (latestDelivery.length > 0) {
      await db.update(ugcDeliveries)
        .set({ status: "rejected", rejectedAt: new Date(), rejectionReason: note })
        .where(eq(ugcDeliveries.id, latestDelivery[0].id));
    }

    await db.update(ugcOrders)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(ugcOrders.id, orderId));

    await db.insert(ugcMessages).values({
      campaignId: order.campaignId,
      orderId,
      senderId: userId,
      senderRole: "buyer",
      content: `🔁 Revision requested: ${note}`,
      messageType: "revision",
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error requesting revision:", error);
    res.status(500).json({ error: "Failed to request revision" });
  }
});

router.get("/orders/:id/chat", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;

    const [order] = await db.select().from(ugcOrders)
      .where(eq(ugcOrders.id, orderId))
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    const isCreator = profile.length > 0 && profile[0].id === order.creatorId;
    const isBuyer = order.buyerUserId === userId;

    if (!isCreator && !isBuyer) {
      return res.status(403).json({ error: "Access denied" });
    }

    const messages = await db.select().from(ugcMessages)
      .where(eq(ugcMessages.orderId, orderId))
      .orderBy(ugcMessages.createdAt);

    res.json({
      messages,
      order,
      userRole: isCreator ? "creator" : "buyer",
      canSend: order.status !== "completed",
    });
  } catch (error) {
    console.error("Error fetching chat:", error);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

router.post("/orders/:id/chat", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = (req as any).user?.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message required" });
    }

    const phoneRegex = /(\d[\s\-]*){6,}/;
    const socialRegex = /(whatsapp|wa\.me|facebook|instagram|telegram|t\.me|snap|tik)/i;

    if (phoneRegex.test(message) || socialRegex.test(message)) {
      return res.status(403).json({ error: "External contact sharing not allowed" });
    }

    const [order] = await db.select().from(ugcOrders)
      .where(eq(ugcOrders.id, orderId))
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status === "completed") {
      return res.status(403).json({ error: "Chat closed - order completed" });
    }

    const profile = await db.select().from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId))
      .limit(1);

    const isCreator = profile.length > 0 && profile[0].id === order.creatorId;
    const isBuyer = order.buyerUserId === userId;

    if (!isCreator && !isBuyer) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [msg] = await db.insert(ugcMessages).values({
      campaignId: order.campaignId,
      orderId,
      senderId: userId,
      senderRole: isCreator ? "creator" : "buyer",
      content: message,
      messageType: "text",
    }).returning();

    res.json(msg);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.post("/ai/generate-video", isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!isLumaConfigured()) {
      return res.status(503).json({ error: "LumaAI not configured" });
    }

    const { prompt, productInfo, style } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const result = await generateUgcVideo(prompt, productInfo, style);

    res.json(result);
  } catch (error: any) {
    console.error("Error generating video:", error);
    res.status(500).json({ error: error.message || "Failed to generate video" });
  }
});

router.get("/ai/luma-status", isAuthenticated, async (req: Request, res: Response) => {
  res.json({ configured: isLumaConfigured() });
});

export function registerUGCRoutes(app: any): void {
  app.use("/api/ugc", router);
}
