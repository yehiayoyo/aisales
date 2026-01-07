import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface Message {
  direction: string;
  content: string;
}

interface ToneProfile {
  name: string;
  systemPrompt: string;
}

const TONE_PROFILES: Record<string, ToneProfile> = {
  professional: {
    name: "Professional",
    systemPrompt: `You are a professional business assistant. Respond in a helpful, courteous, and professional manner. Keep responses concise but informative. Focus on solving customer problems efficiently.`,
  },
  friendly: {
    name: "Friendly",
    systemPrompt: `You are a friendly and approachable business assistant. Use a warm, conversational tone while still being helpful and professional. Feel free to use casual language appropriate for the platform.`,
  },
  sales: {
    name: "Sales-Focused",
    systemPrompt: `You are an AI sales agent replying to customer messages on Facebook, Instagram, and WhatsApp.
Your goal is to:
- Answer questions clearly.
- Qualify the customer.
- Overcome objections.
- Guide the conversation until the sale is completed.
Reply naturally, politely, and persuasively.
Ask questions when needed and stop after closing the deal.`,
  },
  support: {
    name: "Customer Support",
    systemPrompt: `You are a customer support specialist. Focus on understanding and resolving customer issues. Be patient, empathetic, and thorough in your responses. Always aim to leave the customer satisfied.`,
  },
};

const conversationMemory: Map<string, Array<{ role: "user" | "assistant"; content: string }>> = new Map();
const MEMORY_LIMIT = 20;

function getConversationKey(userId: string, conversationId?: number): string {
  return conversationId ? `${userId}:${conversationId}` : userId;
}

function addToMemory(
  key: string,
  role: "user" | "assistant",
  content: string
): void {
  if (!conversationMemory.has(key)) {
    conversationMemory.set(key, []);
  }
  const memory = conversationMemory.get(key)!;
  memory.push({ role, content });
  
  if (memory.length > MEMORY_LIMIT) {
    memory.shift();
  }
}

function getMemory(key: string): Array<{ role: "user" | "assistant"; content: string }> {
  return conversationMemory.get(key) || [];
}

export async function generateAIReply(
  incomingMessage: string,
  recentMessages: Message[],
  userId: string,
  tone: string = "professional",
  conversationId?: number
): Promise<string> {
  const toneProfile = TONE_PROFILES[tone] || TONE_PROFILES.professional;
  const memoryKey = getConversationKey(userId, conversationId);
  
  addToMemory(memoryKey, "user", incomingMessage);

  const conversationContext = recentMessages
    .slice(-5)
    .map((m) => ({
      role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

  const memoryContext = getMemory(memoryKey).slice(-10);

  const allContext = [...memoryContext.slice(0, -1), ...conversationContext];
  const uniqueContext = allContext.filter(
    (msg, index, self) =>
      index === self.findIndex((m) => m.content === msg.content && m.role === msg.role)
  ).slice(-10);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `${toneProfile.systemPrompt}

Important guidelines:
- Keep responses concise (2-3 sentences for simple queries, more for complex ones)
- Match the language of the customer
- If you don't know something, say so honestly
- Never share sensitive business information
- Suggest human assistance for complex issues that need escalation`,
        },
        ...uniqueContext,
        { role: "user", content: incomingMessage },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content || "I apologize, but I'm having trouble processing your request. Let me connect you with a team member.";
    
    addToMemory(memoryKey, "assistant", reply);
    
    return reply;
  } catch (error) {
    console.error("AI reply generation failed:", error);
    return "Thank you for your message. A team member will respond shortly.";
  }
}

export async function generateContent(
  type: string,
  platform: string,
  topic: string,
  tone: string = "professional"
): Promise<string> {
  const toneProfile = TONE_PROFILES[tone] || TONE_PROFILES.professional;
  
  const platformGuidelines: Record<string, string> = {
    facebook: "Write for Facebook: Use engaging, conversational language. Can be longer form. Include a call-to-action.",
    instagram: "Write for Instagram: Keep it visual and concise. Use relevant emoji sparingly. Include relevant hashtags.",
    whatsapp: "Write for WhatsApp Business: Keep it brief and personal. Direct messaging style.",
    general: "Write for general social media use. Balance between professional and engaging.",
  };

  const contentTypes: Record<string, string> = {
    post: "Create a social media post",
    caption: "Write a caption for an image or video",
    ad: "Write advertising copy that converts",
    story: "Write content for a story/ephemeral post",
  };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert social media content creator. ${toneProfile.systemPrompt}
          
${platformGuidelines[platform] || platformGuidelines.general}

Guidelines:
- Be authentic and engaging
- Match brand voice
- Optimize for the specific platform
- Include relevant calls-to-action when appropriate`,
        },
        {
          role: "user",
          content: `${contentTypes[type] || contentTypes.post} about: ${topic}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || "Unable to generate content. Please try again.";
  } catch (error) {
    console.error("Content generation failed:", error);
    throw new Error("Failed to generate content");
  }
}

export async function analyzeSentiment(text: string): Promise<{
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  summary: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Analyze the sentiment of the given text. Respond in JSON format with:
- sentiment: "positive", "negative", or "neutral"
- confidence: 0.0 to 1.0
- summary: brief explanation of the sentiment`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "";
    try {
      return JSON.parse(content);
    } catch {
      return { sentiment: "neutral", confidence: 0.5, summary: "Unable to determine sentiment" };
    }
  } catch (error) {
    console.error("Sentiment analysis failed:", error);
    return { sentiment: "neutral", confidence: 0, summary: "Analysis failed" };
  }
}

export function clearConversationMemory(userId: string, conversationId?: number): void {
  const key = getConversationKey(userId, conversationId);
  conversationMemory.delete(key);
}

export function getToneProfiles(): ToneProfile[] {
  return Object.values(TONE_PROFILES);
}

interface CampaignParams {
  productName: string;
  productDescription: string;
  platform: string;
  tone: string;
  numberOfPosts: number;
  postTypes: string[];
}

interface GeneratedPost {
  content: string;
  type: string;
}

export async function generateCampaignPosts(params: CampaignParams): Promise<GeneratedPost[]> {
  const { productName, productDescription, platform, tone, numberOfPosts, postTypes } = params;
  const toneProfile = TONE_PROFILES[tone] || TONE_PROFILES.professional;

  const platformGuidelines: Record<string, string> = {
    facebook: "Facebook: conversational, can be longer, include CTAs",
    instagram: "Instagram: visual focus, concise, use emojis and hashtags",
    whatsapp: "WhatsApp: brief, personal, direct messaging style",
    general: "General social media: balance professional and engaging",
  };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert social media marketing strategist. ${toneProfile.systemPrompt}

Your task is to create a cohesive marketing campaign with ${numberOfPosts} unique posts for the product.
Platform focus: ${platformGuidelines[platform] || platformGuidelines.general}

Guidelines:
- Each post should be unique but maintain brand consistency
- Vary the content types: regular posts, stories, ads, testimonials, tips
- Include calls-to-action where appropriate
- Create a narrative arc across the campaign
- Make posts engaging and shareable

IMPORTANT: Respond with a JSON array of objects, each with "content" (the post text) and "type" (post/story/ad/tip/testimonial).`,
        },
        {
          role: "user",
          content: `Create ${numberOfPosts} unique social media posts for this product:

Product: ${productName}
Description: ${productDescription}
Post types to include: ${postTypes.join(", ")}

Generate varied, engaging content for a multi-day campaign.`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.9,
    });

    const content = response.choices[0]?.message?.content || "[]";
    
    try {
      // Try to parse JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const posts = JSON.parse(jsonMatch[0]);
        return posts.slice(0, numberOfPosts);
      }
    } catch (parseError) {
      console.error("Failed to parse campaign posts JSON:", parseError);
    }

    // Fallback: generate simple posts if JSON parsing fails
    const fallbackPosts: GeneratedPost[] = [];
    for (let i = 0; i < numberOfPosts; i++) {
      fallbackPosts.push({
        content: `Check out ${productName}! ${productDescription} #${productName.replace(/\s+/g, '')}`,
        type: postTypes[i % postTypes.length]
      });
    }
    return fallbackPosts;

  } catch (error) {
    console.error("Campaign generation failed:", error);
    throw new Error("Failed to generate campaign posts");
  }
}
