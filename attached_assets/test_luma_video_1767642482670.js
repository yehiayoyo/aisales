// test_luma_video.js
require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.LUMAAI_API_KEY || 'YOUR_LUMA_KEY';
const VIDEO_URL = process.env.LUMAAI_VIDEO_GENERATE_URL || 'https://api.lumalabs.ai/dream-machine/v1/generations/video';
const TASKS_URL_BASE = process.env.LUMAAI_TASKS_URL || 'https://api.lumalabs.ai/dream-machine/v1/generations';

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function createVideo() {
  try {
    const payload = {
      prompt: "A superhero wearing sunglasses eating shawerma, cinematic, 6 seconds",
      model: "ray-1-6",
      generation_type: "video",
      duration_seconds: 6,
      format: "mp4",
      aspect_ratio: "16:9",
      width: 1280,
      height: 720,
      // add other options if needed
    };

    console.log("Sending create request to Luma (video)...");
    const r = await axios.post(VIDEO_URL, payload, {
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 120000
    });

    console.log("CREATE response (raw):");
    console.log(JSON.stringify(r.data, null, 2));
    const id = r.data?.id || r.data?.request_id || r.data?.data?.id;
    console.log("creation id:", id);
    return id;
  } catch (e) {
    console.error("CREATE ERROR:", e.response?.status, e.response?.data || e.message);
    throw e;
  }
}

async function pollById(id, timeoutMs=300000, interval=3000) {
  const started = Date.now();
  const pollUrl = `${TASKS_URL_BASE}/${id}`;
  console.log("Polling:", pollUrl);
  while (true) {
    try {
      const rr = await axios.get(pollUrl, { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: 120000 });
      console.log("poll response state snippet:", rr.data?.state || rr.data?.status || 'no-state');
      // print some important parts
      console.log(JSON.stringify(rr.data, null, 2).slice(0, 1000));
      if (!rr.data) return rr.data;
      const st = String(rr.data?.state || rr.data?.status || '').toLowerCase();
      if (st === 'completed' || st === 'succeeded') return rr.data;
      if (st === 'failed' || rr.data?.failure_reason) return rr.data;
      if (Date.now() - started > timeoutMs) return { state: 'timeout', detail: rr.data };
    } catch (err) {
      console.error("poll error:", err.response?.status, err.response?.data || err.message);
    }
    await sleep(interval);
  }
}

(async () => {
  try {
    const id = await createVideo();
    if (!id) { console.error("No id returned from create — check create response above."); return; }
    const final = await pollById(id);
    console.log("FINAL (full):");
    console.log(JSON.stringify(final, null, 2));
    // try common places for URL
    const url =
      final?.video_url ||
      final?.assets?.[0]?.url ||
      final?.output?.[0]?.url ||
      final?.data?.[0]?.url;
    console.log("VIDEO URL:", url || "No URL found — inspect final JSON above.");
  } catch (e) {
    console.error("FATAL:", e.response?.data || e.message || e);
  }
})();