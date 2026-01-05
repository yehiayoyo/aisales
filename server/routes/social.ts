import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import { db } from "../db.js";
import { socialAccounts } from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";

export function registerSocialRoutes(app: Express): void {
  app.get("/api/social/accounts", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const accounts = await db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId));
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching social accounts:", error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.get("/api/social/connect/facebook", isAuthenticated, async (req: any, res: Response) => {
    const fbAppId = process.env.FACEBOOK_APP_ID;
    const redirectUri = `${process.env.BASE_URL || `https://${req.hostname}`}/api/social/callback/facebook`;
    const scope = "pages_show_list,pages_read_engagement,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages";
    
    if (!fbAppId) {
      return res.status(500).json({ error: "Facebook App not configured" });
    }
    
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${req.user.claims.sub}`;
    res.redirect(authUrl);
  });

  app.get("/api/social/callback/facebook", isAuthenticated, async (req: any, res: Response) => {
    const { code } = req.query;
    const userId = req.user.claims.sub;
    
    if (!code) {
      return res.redirect("/dashboard?error=oauth_failed");
    }
    
    try {
      const fbAppId = process.env.FACEBOOK_APP_ID;
      const fbAppSecret = process.env.FACEBOOK_APP_SECRET;
      const redirectUri = `${process.env.BASE_URL || `https://${req.hostname}`}/api/social/callback/facebook`;
      
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${fbAppSecret}&code=${code}`
      );
      const tokenData = await tokenResponse.json() as { access_token?: string; error?: any };
      
      if (!tokenData.access_token) {
        console.error("Facebook token error:", tokenData);
        return res.redirect("/dashboard?error=token_failed");
      }
      
      const userResponse = await fetch(`https://graph.facebook.com/me?access_token=${tokenData.access_token}&fields=id,name`);
      const userData = await userResponse.json() as { id: string; name: string };
      
      const pagesResponse = await fetch(`https://graph.facebook.com/me/accounts?access_token=${tokenData.access_token}&fields=id,name,access_token,category`);
      const pagesData = await pagesResponse.json() as { data?: Array<{ id: string; name: string; access_token: string; category: string }> };
      
      if (pagesData.data && pagesData.data.length > 0) {
        for (const page of pagesData.data) {
          const existing = await db.select().from(socialAccounts).where(
            and(
              eq(socialAccounts.userId, userId),
              eq(socialAccounts.platformAccountId, page.id)
            )
          );
          
          if (existing.length === 0) {
            await db.insert(socialAccounts).values({
              userId: userId,
              platform: "facebook",
              platformAccountId: page.id,
              accountName: page.name,
              accountType: page.category,
              accessToken: tokenData.access_token,
              pageAccessToken: page.access_token,
              permissions: ["pages_show_list", "pages_read_engagement", "pages_messaging"],
              isActive: true,
            });
          } else {
            await db.update(socialAccounts)
              .set({
                accessToken: tokenData.access_token,
                pageAccessToken: page.access_token,
                updatedAt: new Date(),
              })
              .where(eq(socialAccounts.id, existing[0].id));
          }
        }
      }
      
      res.redirect("/dashboard?success=connected");
    } catch (error) {
      console.error("Facebook OAuth error:", error);
      res.redirect("/dashboard?error=oauth_error");
    }
  });

  app.delete("/api/social/accounts/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const accountId = parseInt(req.params.id);
      
      await db.delete(socialAccounts).where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.userId, userId)
        )
      );
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });
}
