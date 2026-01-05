import type { AIProvider, AIMessage, AIProviderResponse, GenerateOptions, AIModel } from "./index.js";

const LUMAAI_API_KEY = process.env.LUMAAI_API_KEY;
const LUMAAI_IMAGE_URL = process.env.LUMAAI_GENERATE_URL || "https://api.lumalabs.ai/dream-machine/v1/generations/image";
const LUMAAI_VIDEO_URL = process.env.LUMAAI_VIDEO_URL || "https://api.lumalabs.ai/dream-machine/v1/generations";
const LUMAAI_GET_BASE = process.env.LUMAAI_GET_BASE || "https://api.lumalabs.ai/dream-machine/v1/generations";

const models: AIModel[] = [
  { id: "photon-1", name: "Photon 1", description: "High-quality image generation", default: true },
  { id: "photon-flash-1", name: "Photon Flash", description: "Fast image generation" },
  { id: "ray-2", name: "Ray 2", description: "Advanced video generation" },
  { id: "ray-1-6", name: "Ray 1.6", description: "Standard video generation" },
];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureModel(modelId: string | undefined, isVideo: boolean): string {
  if (!modelId) return isVideo ? "ray-2" : "photon-1";
  const m = modelId.toLowerCase();
  if (isVideo) {
    if (m.startsWith("ray")) return m;
    return "ray-2";
  } else {
    if (m.startsWith("photon")) return m;
    return "photon-1";
  }
}

async function pollTask(taskId: string, timeoutMs: number = 300000, intervalMs: number = 5000): Promise<any> {
  const startTime = Date.now();
  
  while (true) {
    try {
      const response = await fetch(`${LUMAAI_GET_BASE}/${taskId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${LUMAAI_API_KEY}` },
      });
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      const data = await response.json();
      const state = (data.state || data.status || "").toLowerCase();
      
      if (["completed", "succeeded", "finished"].includes(state)) {
        return data;
      }
      
      if (state === "failed" || data.failure_reason) {
        throw new Error(data.failure_reason || "Generation failed");
      }
      
      if (Date.now() - startTime > timeoutMs) {
        throw new Error("Generation timed out");
      }
      
      await sleep(intervalMs);
    } catch (error: any) {
      if (error.message.includes("timed out") || error.message.includes("failed")) {
        throw error;
      }
      console.warn("Poll error:", error.message);
      await sleep(intervalMs);
    }
  }
}

function extractMediaUrl(data: any, isVideo: boolean): string | null {
  if (isVideo) {
    return data?.assets?.video || data?.video_url || data?.url || null;
  }
  const exts = [".jpg", ".jpeg", ".png", ".webp"];
  function findUrl(obj: any): string | null {
    if (!obj) return null;
    if (typeof obj === "string") {
      const lower = obj.toLowerCase();
      if (exts.some((ext) => lower.endsWith(ext)) || lower.includes("image")) return obj;
      return null;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findUrl(item);
        if (found) return found;
      }
    }
    if (typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        const found = findUrl(obj[key]);
        if (found) return found;
      }
    }
    return null;
  }
  return findUrl(data);
}

export const lumaProvider: AIProvider = {
  id: "luma",
  name: "Luma AI",
  description: "Generate stunning images and videos with Dream Machine",
  icon: "🎬",
  capabilities: ["image", "video"],
  models,

  async generate(messages: AIMessage[], options: GenerateOptions): Promise<AIProviderResponse> {
    try {
      if (!LUMAAI_API_KEY) {
        throw new Error("LUMAAI_API_KEY is not configured");
      }

      const lastMessage = messages.filter((m) => m.role === "user").pop();
      if (!lastMessage) {
        throw new Error("No user message provided");
      }

      const prompt = lastMessage.content;
      const isVideo = options.model?.startsWith("ray") || !!(options.duration && options.duration > 0);
      const modelId = ensureModel(options.model, isVideo);
      const aspectRatio = options.aspectRatio || "16:9";

      const payload: any = {
        prompt,
        model: modelId,
        aspect_ratio: aspectRatio,
      };

      if (isVideo) {
        payload.duration_seconds = options.duration || 5;
        payload.width = options.width || 1280;
        payload.height = options.height || 720;
      } else {
        payload.width = options.width || 1024;
        payload.height = options.height || 1024;
      }

      const url = isVideo ? LUMAAI_VIDEO_URL : LUMAAI_IMAGE_URL;

      const createResponse = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LUMAAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Luma API error: ${createResponse.status} - ${errorText}`);
      }

      const created = await createResponse.json();
      const taskId = created?.id || created?.data?.id || created?.request?.id;

      if (!taskId) {
        const mediaUrl = extractMediaUrl(created, isVideo);
        if (mediaUrl) {
          return {
            content: mediaUrl,
            type: isVideo ? "video" : "image",
            metadata: { model: modelId, aspectRatio },
          };
        }
        throw new Error("No task ID returned from Luma");
      }

      const result = await pollTask(taskId, isVideo ? 300000 : 180000, 5000);
      const mediaUrl = extractMediaUrl(result, isVideo);

      if (!mediaUrl) {
        throw new Error("No media URL in completed generation");
      }

      return {
        content: mediaUrl,
        type: isVideo ? "video" : "image",
        metadata: {
          model: modelId,
          taskId,
          aspectRatio,
          duration: isVideo ? options.duration : undefined,
        },
      };
    } catch (error: any) {
      console.error("Luma provider error:", error);
      return {
        content: "",
        type: "image",
        error: error.message || "Luma generation failed",
      };
    }
  },

  isConfigured(): boolean {
    return !!LUMAAI_API_KEY;
  },
};
