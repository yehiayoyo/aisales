import OpenAI from "openai";

const LUMAAI_API_KEY = process.env.LUMAAI_API_KEY;
const LUMAAI_VIDEO_URL = process.env.LUMAAI_VIDEO_URL || "https://api.lumalabs.ai/dream-machine/v1/generations";
const LUMAAI_GET_BASE = process.env.LUMAAI_GET_BASE || "https://api.lumalabs.ai/dream-machine/v1/generations";

interface VideoGenerationOptions {
  prompt: string;
  model?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  width?: number;
  height?: number;
}

interface LumaGenerationResponse {
  id: string;
  state: string;
  failure_reason?: string;
  assets?: {
    video?: string;
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createVideoGeneration(options: VideoGenerationOptions): Promise<LumaGenerationResponse> {
  if (!LUMAAI_API_KEY) {
    throw new Error("LUMAAI_API_KEY is not configured");
  }

  const payload = {
    prompt: options.prompt,
    model: options.model || "ray-2",
    duration_seconds: options.durationSeconds || 5,
    aspect_ratio: options.aspectRatio || "16:9",
    width: options.width || 1280,
    height: options.height || 720,
  };

  const response = await fetch(LUMAAI_VIDEO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LUMAAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`LumaAI API error: ${response.status} - ${errorData}`);
  }

  return response.json();
}

export async function getGenerationStatus(generationId: string): Promise<LumaGenerationResponse> {
  if (!LUMAAI_API_KEY) {
    throw new Error("LUMAAI_API_KEY is not configured");
  }

  const response = await fetch(`${LUMAAI_GET_BASE}/${generationId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${LUMAAI_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`LumaAI status check error: ${response.status} - ${errorData}`);
  }

  return response.json();
}

export async function pollUntilComplete(
  generationId: string,
  timeoutMs: number = 300000,
  intervalMs: number = 5000
): Promise<LumaGenerationResponse> {
  const startTime = Date.now();

  while (true) {
    const status = await getGenerationStatus(generationId);
    const state = status.state?.toLowerCase();

    if (state === "completed" || state === "succeeded") {
      return status;
    }

    if (state === "failed" || status.failure_reason) {
      throw new Error(`Video generation failed: ${status.failure_reason || "Unknown error"}`);
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Video generation timed out");
    }

    await sleep(intervalMs);
  }
}

export async function generateVideo(options: VideoGenerationOptions): Promise<{ videoUrl: string; generationId: string }> {
  const creation = await createVideoGeneration(options);

  if (!creation.id) {
    throw new Error("No generation ID returned from LumaAI");
  }

  const result = await pollUntilComplete(creation.id);

  const videoUrl = result.assets?.video;
  if (!videoUrl) {
    throw new Error("No video URL in completed generation");
  }

  return {
    videoUrl,
    generationId: creation.id,
  };
}

export async function generateUgcVideo(
  prompt: string,
  productInfo?: string,
  style?: string
): Promise<{ videoUrl: string; generationId: string }> {
  let enhancedPrompt = prompt;

  if (productInfo) {
    enhancedPrompt += `. Product: ${productInfo}`;
  }

  if (style) {
    enhancedPrompt += `. Style: ${style}`;
  }

  enhancedPrompt += ". High quality UGC style video, authentic, engaging.";

  return generateVideo({
    prompt: enhancedPrompt,
    durationSeconds: 6,
    aspectRatio: "9:16",
  });
}

export function isLumaConfigured(): boolean {
  return !!LUMAAI_API_KEY;
}
