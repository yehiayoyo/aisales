import { db } from "../db.js";
import { scheduledPosts, socialAccounts } from "../../shared/schema.js";
import { eq, and, lte } from "drizzle-orm";

export async function publishToFacebook(pageId: string, pageAccessToken: string, content: string): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          access_token: pageAccessToken
        })
      }
    );
    
    const data = await response.json() as { id?: string; error?: { message: string } };
    
    if (data.error) {
      console.error('Facebook post error:', data.error);
      return { success: false, error: data.error.message };
    }
    
    return { success: true, postId: data.id };
  } catch (error) {
    console.error('Error publishing to Facebook:', error);
    return { success: false, error: 'Network error' };
  }
}

export async function processDuePosts(): Promise<void> {
  try {
    const now = new Date();
    
    const duePosts = await db.select({
      post: scheduledPosts,
      account: socialAccounts
    })
    .from(scheduledPosts)
    .innerJoin(socialAccounts, eq(scheduledPosts.socialAccountId, socialAccounts.id))
    .where(
      and(
        eq(scheduledPosts.status, 'pending'),
        lte(scheduledPosts.scheduledFor, now)
      )
    );
    
    console.log(`Processing ${duePosts.length} due posts...`);
    
    for (const { post, account } of duePosts) {
      if (account.platform === 'facebook' && account.pageAccessToken) {
        console.log(`Publishing post ${post.id} to ${account.accountName}...`);
        
        const result = await publishToFacebook(
          account.platformAccountId,
          account.pageAccessToken,
          post.content
        );
        
        if (result.success) {
          await db.update(scheduledPosts)
            .set({ 
              status: 'published',
              publishedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(scheduledPosts.id, post.id));
          
          console.log(`Post ${post.id} published successfully! Facebook Post ID: ${result.postId}`);
        } else {
          await db.update(scheduledPosts)
            .set({ 
              status: 'failed',
              updatedAt: new Date()
            })
            .where(eq(scheduledPosts.id, post.id));
          
          console.error(`Post ${post.id} failed: ${result.error}`);
        }
      } else {
        console.log(`Skipping post ${post.id} - unsupported platform or missing token`);
      }
    }
  } catch (error) {
    console.error('Error processing due posts:', error);
  }
}

export function startPostScheduler(): void {
  console.log('Starting post scheduler (checking every 60 seconds)...');
  
  processDuePosts();
  
  setInterval(() => {
    processDuePosts();
  }, 60 * 1000);
}
