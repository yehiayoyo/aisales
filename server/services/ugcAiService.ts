import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface BriefInput {
  contentType: string;
  platform: string;
  tone?: string;
  style?: string;
  productInfo?: string;
  description?: string;
}

export async function generateAIBrief(input: BriefInput): Promise<{
  brief: string;
  talkingPoints: string[];
  hookIdeas: string[];
}> {
  const platformGuidelines: Record<string, string> = {
    tiktok: "TikTok: Hook in first 3 seconds, trending sounds, fast-paced, authentic feel, 15-60 seconds optimal",
    instagram: "Instagram Reels: Polished but authentic, strong visual hook, engaging captions, hashtags",
    facebook: "Facebook: Slightly longer format OK, clear value proposition, conversational",
    ads: "Paid Ads: Strong CTA, problem-solution format, social proof elements, clear benefits",
  };

  const contentGuidelines: Record<string, string> = {
    video: "Create a video script with clear scene-by-scene breakdown",
    image: "Describe the visual composition, poses, and mood",
    reel: "Short-form vertical video with hook, content, and CTA",
    story: "Ephemeral content that creates urgency or behind-the-scenes feel",
  };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert UGC (User Generated Content) brief writer. Create clear, actionable briefs for content creators.

Platform Guidelines:
${platformGuidelines[input.platform] || platformGuidelines.instagram}

Content Type:
${contentGuidelines[input.contentType] || contentGuidelines.video}

Your response must be valid JSON with this structure:
{
  "brief": "Clear, detailed creative brief with specific instructions",
  "talkingPoints": ["Point 1", "Point 2", "Point 3"],
  "hookIdeas": ["Hook idea 1", "Hook idea 2", "Hook idea 3"]
}`,
        },
        {
          role: "user",
          content: `Create a UGC brief for:

Content Type: ${input.contentType}
Platform: ${input.platform}
Tone: ${input.tone || "authentic and engaging"}
Style: ${input.style || "natural UGC style"}
Product/Service: ${input.productInfo || "Not specified"}
Campaign Description: ${input.description || "Not specified"}

Generate a professional brief with talking points and hook ideas.`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return {
        brief: parsed.brief || "",
        talkingPoints: parsed.talkingPoints || [],
        hookIdeas: parsed.hookIdeas || [],
      };
    } catch {
      return {
        brief: content,
        talkingPoints: [],
        hookIdeas: [],
      };
    }
  } catch (error) {
    console.error("AI brief generation failed:", error);
    throw new Error("Failed to generate AI brief");
  }
}

export async function generateScriptAssistance(
  contentType: string,
  platform: string,
  productInfo: string,
  tone: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a UGC script writer. Write authentic, engaging scripts that feel natural and unscripted while hitting key talking points. Format scripts with clear scene markers and dialogue/action notes.`,
        },
        {
          role: "user",
          content: `Write a ${contentType} script for ${platform}.

Product/Service: ${productInfo}
Tone: ${tone}

Create a complete script with:
- Hook (first 3 seconds)
- Main content
- Call to action`,
        },
      ],
      max_tokens: 800,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || "Unable to generate script";
  } catch (error) {
    console.error("Script generation failed:", error);
    throw new Error("Failed to generate script");
  }
}

export async function generateHookSuggestions(
  productInfo: string,
  platform: string
): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Generate 5 attention-grabbing hooks for UGC content. Hooks should stop the scroll and create curiosity. Return as JSON array of strings.`,
        },
        {
          role: "user",
          content: `Generate hooks for ${platform} about: ${productInfo}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.9,
    });

    const content = response.choices[0]?.message?.content || "[]";
    try {
      return JSON.parse(content);
    } catch {
      return [content];
    }
  } catch (error) {
    console.error("Hook generation failed:", error);
    return [];
  }
}

export async function analyzeContentQuality(
  contentType: string,
  platform: string,
  duration?: number,
  caption?: string
): Promise<{
  score: number;
  notes: {
    length?: string;
    structure?: string;
    engagement?: string;
  };
}> {
  const platformOptimalDurations: Record<string, { min: number; max: number; optimal: number }> = {
    tiktok: { min: 15, max: 60, optimal: 30 },
    instagram: { min: 15, max: 90, optimal: 30 },
    facebook: { min: 30, max: 180, optimal: 60 },
    ads: { min: 15, max: 30, optimal: 20 },
  };

  const platformDuration = platformOptimalDurations[platform] || platformOptimalDurations.instagram;
  let lengthScore = 100;
  let lengthNote = "Optimal length";

  if (duration) {
    if (duration < platformDuration.min) {
      lengthScore = 60;
      lengthNote = `Too short. Recommended: ${platformDuration.min}-${platformDuration.max}s`;
    } else if (duration > platformDuration.max) {
      lengthScore = 70;
      lengthNote = `May be too long. Optimal for ${platform}: ${platformDuration.optimal}s`;
    } else if (Math.abs(duration - platformDuration.optimal) <= 10) {
      lengthScore = 100;
      lengthNote = `Perfect length for ${platform}`;
    } else {
      lengthScore = 85;
      lengthNote = `Good length. Optimal: ${platformDuration.optimal}s`;
    }
  }

  let structureNote = "Structure analysis pending review";
  let engagementNote = "Engagement potential analysis pending";
  let structureScore = 80;
  let engagementScore = 80;

  if (caption) {
    if (caption.length < 50) {
      engagementNote = "Caption too short - add more context or CTA";
      engagementScore = 60;
    } else if (caption.length > 300 && platform === "tiktok") {
      engagementNote = "Caption may be too long for TikTok";
      engagementScore = 75;
    } else {
      engagementNote = "Caption length is appropriate";
      engagementScore = 90;
    }

    if (caption.includes("#")) {
      structureScore += 5;
      structureNote = "Includes hashtags - good for discoverability";
    }
  }

  const overallScore = Math.round((lengthScore + structureScore + engagementScore) / 3);

  return {
    score: overallScore,
    notes: {
      length: lengthNote,
      structure: structureNote,
      engagement: engagementNote,
    },
  };
}

export async function generateRevisionFeedback(
  originalBrief: string,
  submissionCaption?: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a professional content reviewer providing constructive feedback. Be specific, actionable, and encouraging. Focus on what can be improved while acknowledging what works well.`,
        },
        {
          role: "user",
          content: `Review this UGC submission against the original brief:

Original Brief:
${originalBrief}

Submitted Caption:
${submissionCaption || "No caption provided"}

Provide specific, constructive feedback for the creator.`,
        },
      ],
      max_tokens: 400,
      temperature: 0.6,
    });

    return response.choices[0]?.message?.content || "Unable to generate feedback";
  } catch (error) {
    console.error("Feedback generation failed:", error);
    return "Please review the submission manually.";
  }
}
