require("dotenv").config();
const axios = require("axios");

const API_KEY = process.env.LUMAAI_API_KEY;
const CREATE_URL = "https://api.lumalabs.ai/dream-machine/v1/generations/video";

(async () => {
  try {
    const payload = {
      prompt: "A superhero eating shawerma, cinematic",
      model: "ray-1-6",
      duration_seconds: 6,
      aspect_ratio: "16:9",
      format: "mp4",
      width: 1280,
      height: 720
    };

    console.log("Sending CREATE request...");
    const r = await axios.post(CREATE_URL, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    console.log("\n===== CREATE RESPONSE =====");
    console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.log("\n❌ CREATE ERROR:");
    console.log(e.response?.data || e.message);
  }
})();