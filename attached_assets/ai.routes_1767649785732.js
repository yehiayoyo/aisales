// server.js - MT HUB AI (Luma Image + Video via REST)
require('dotenv').config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const axios = require("axios"); 
const dashboardRoutes = require("./routes/dashboard.routes");
const socialRoutes = require("./social/routes/social.routes");
require("dotenv").config();


const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/dashboard", dashboardRoutes);
app.use("/social", socialRoutes);


// OpenAI (proxy)
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Tavily (optional)
const TAVILY_API_KEY  = process.env.TAVILY_API_KEY  || '';
const TAVILY_BASE_URL = process.env.TAVILY_BASE_URL || '';

// Luma (REST only)
const LUMAAI_API_KEY            = process.env.LUMAAI_API_KEY || '';
const LUMAAI_IMAGE_URL          = process.env.LUMAAI_GENERATE_URL       || 'https://api.lumalabs.ai/dream-machine/v1/generations/image';
const LUMAAI_VIDEO_URL          = process.env.LUMAAI_VIDEO_GENERATE_URL || 'https://api.lumalabs.ai/dream-machine/v1/generations/video';
const LUMAAI_TASKS_URL          = process.env.LUMAAI_TASKS_URL          || 'https://api.lumalabs.ai/dream-machine/v1/generations';

// local JSON DB
const DB_PATH = path.join(__dirname, 'db.json');

// === auto-backup db.json on server start ===
(function backupDB(){
  try{
    if(!fs.existsSync(DB_PATH)) return;

    const backupDir = path.join(__dirname, "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const fileName = `db-${stamp}.json`;
    const dst = path.join(backupDir, fileName);

    fs.copyFileSync(DB_PATH, dst);
    console.log("📦 Backup saved:", fileName);
  } catch(err){
    console.error("Backup error:", err);
  }
})();

/* ---------- simple local DB helpers ---------- */
function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({ chats: [] }, null, 2));
    }
    const raw  = fs.readFileSync(DB_PATH, 'utf8') || '{"chats":[]}';
    const data = JSON.parse(raw);
    if (!Array.isArray(data.chats)) data.chats = [];
    return data;
  } catch (e) {
    console.error('readDb error', e);
    return { chats: [] };
  }
}

function writeDb(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('writeDb error', e);
  }
}

function createEmptyChat() {
  const now = new Date().toISOString();
  return {
    id: Date.now().toString(),
    title: 'محادثة جديدة',
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

/* ---------- Tavily search (optional) ---------- */
async function tavilySearch(query, limit = 5) {
  if (!TAVILY_BASE_URL || !TAVILY_API_KEY) return null;
  try {
    const res = await axios.post(
      `${TAVILY_BASE_URL}/search`,
      { query, limit },
      {
        headers: {
          Authorization: `Bearer ${TAVILY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    );
    return res.data;
  } catch (err) {
    console.error('tavilySearch error:', err?.response?.data || err.message || err);
    return null;
  }
}

/* ---------- Luma helpers (REST) ---------- */

// model mapping: لو فيديو نرجّع ray-* ، لو صورة نرجّع photon-*
function ensureLumaModel(m, isVideo) {
  const defVideo = 'ray-1-6';
  const defImage = 'photon-1';
  if (!m) return isVideo ? defVideo : defImage;
  const mm = String(m).trim().toLowerCase();

  if (isVideo) {
    if (mm.startsWith('ray')) return mm;
    return defVideo;
  } else {
    if (mm === 'photon-1' || mm === 'photon-flash-1') return mm;
    if (mm.startsWith('photon-flash')) return 'photon-flash-1';
    if (mm.startsWith('photon')) return 'photon-1';
    return defImage;
  }
}

// polling لحد ما الـ task يخلص
async function pollLumaTask(id, timeoutMs = 180000, interval = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await axios.get(`${LUMAAI_TASKS_URL}/${id}`, {
        headers: { Authorization: `Bearer ${LUMAAI_API_KEY}` },
        timeout: 120000
      });
      const data = r.data;
      const st = String(data.state || data.status || '').toLowerCase();
      if (st) console.log('Luma state:', st);

      if (['completed', 'succeeded', 'finished'].includes(st)) return data;
      if (st === 'failed' || data.failure_reason) return data;
    } catch (e) {
      console.warn('pollLumaTask error:', e?.response?.data || e.message || e);
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return { state: 'timeout' };
}

// بحث عام عن أول URL بينتهي بامتدادات معينة
function findUrlWithExt(obj, exts) {
  if (!obj) return null;
  if (typeof obj === 'string') {
    const lower = obj.toLowerCase();
    if (exts.some(ext => lower.endsWith(ext))) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const found = findUrlWithExt(it, exts);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const found = findUrlWithExt(v, exts);
      if (found) return found;
    }
  }
  return null;
}

// callLumaGenerate: صورة أو فيديو حسب isVideo
async function callLumaGenerate(payload, isVideo) {
  if (!LUMAAI_API_KEY) throw new Error('LUMAAI_API_KEY not configured in .env');

  payload.model = ensureLumaModel(payload.model, isVideo);
  if (!payload.aspect_ratio) payload.aspect_ratio = '16:9';
  if (!payload.format) payload.format = isVideo ? 'mp4' : 'jpg';

  const url = isVideo ? LUMAAI_VIDEO_URL : LUMAAI_IMAGE_URL;

  try {
    const createRes = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${LUMAAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    });

    const created = createRes.data;
    const id =
      created?.id ||
      created?.data?.id ||
      created?.request?.id ||
      created?.request_id;

    if (!id) {
      // مفيش id؛ نرجّع الرد زي ما هو
      return created;
    }

    const final = await pollLumaTask(
      id,
      isVideo ? 240000 : 180000,
      3000
    );
    return final;
  } catch (err) {
    const d = err?.response?.data || err?.message || err;
    const e = new Error(
      'Luma request failed: ' +
        (typeof d === 'string' ? d : JSON.stringify(d).slice(0, 800))
    );
    e.raw = d;
    throw e;
  }
}

/* ---------- OpenAI Chat proxy ---------- */
async function callOpenAIChat(payload) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  try {
    const res = await axios.post(`${OPENAI_BASE_URL}/chat/completions`, payload, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000
    });
    return res.data;
  } catch (err) {
    console.error('OpenAI error:', err?.response?.data || err.message || err);
    throw err;
  }
}

/* ---------- Basic chat endpoints ---------- */
app.get('/api/chats', (req, res) => {
  const db = readDb();
  res.json(db.chats);
});

app.post('/api/newchat', (req, res) => {
  const db = readDb();
  const c = createEmptyChat();
  db.chats.unshift(c);
  writeDb(db);
  res.json(c);
});

app.delete('/api/chats/:id', (req, res) => {
  const id = req.params.id;
  const db = readDb();
  db.chats = db.chats.filter(c => c.id !== id);
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ----------------- simple uploads (multer) -----------------
const multer = require('multer');
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 300 * 1024 * 1024 } }); // 300MB max

// POST /api/upload (form field name = file)
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'no_file' });
    const url = `/uploads/${req.file.filename}`;
    return res.json({ ok:true, url, filename:req.file.filename, originalName:req.file.originalname });
  } catch (err) {
    console.error('upload error', err);
    return res.status(500).json({ ok:false, error:'server_error', detail:String(err) });
  }
});

/* ---------- Unified chat route ---------- */
app.post('/api/chat', async (req, res) => {
  const { chatId, message, model, useWebSearch, agentType } = req.body || {};
  const temperature = typeof req.body.temperature === 'number' ? req.body.temperature : 0.2;
  const max_tokens  = typeof req.body.max_tokens  === 'number' ? req.body.max_tokens  : 800;
  const userMessage = (message || '').toString().trim();
  if (!userMessage) return res.status(400).json({ ok: false, error: 'message is required' });

  const db = readDb();
  let chat = db.chats.find(c => c.id === chatId);
  if (!chat) {
    chat = createEmptyChat();
    db.chats.unshift(chat);
  }
  if (!Array.isArray(chat.messages)) chat.messages = [];

  // ===== persist attachments if provided in request (attachments: [{type,url}]) =====
try {
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  for (const a of attachments) {
    if (!a || !a.url) continue;
    const t = (a.type === 'video' ? 'video' : (a.type === 'audio' ? 'audio' : 'image'));
    // تجنب التكرار: لو نفس الـ URL موجود لا تضيفه
    const dup = chat.messages.find(m => m.content === a.url);
    if (dup) continue;
    chat.messages.push({
      role: 'user',
      type: t,
      content: a.url,
      createdAt: new Date().toISOString()
    });
  }
  // احفظ قبل أي استدعاء خارجي
  writeDb(db);
} catch(e){
  console.warn('attach persist failed', e);
}

  chat.messages.push({ role: 'user', content: userMessage, createdAt: new Date().toISOString() });
  chat.updatedAt = new Date().toISOString();
  if (!chat.title || chat.title === 'محادثة جديدة') {
    chat.title = userMessage.slice(0, 60);
  }

  // إذا جاء مع الطلب attachments (قائمة من {type,url}) خزّنهم في الشات فوراً
try {
  const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  for (const a of attachments) {
    if (!a || !a.url) continue;
    const t = (a.type === 'video' ? 'video' : (a.type === 'audio' ? 'audio' : 'image'));
    chat.messages.push({
      role: 'user',
      type: t,
      content: a.url,
      createdAt: new Date().toISOString()
    });
  }
  // احفظ التغييرات على DB قبل أي استدعاء خارجي
  writeDb(db);
} catch (e) {
  console.warn('attach persist failed', e);
}

  try {
    const agentLower = (agentType || '').toString().toLowerCase();
    const isLumaAgent = agentLower.includes('luma');

    /* ----- Luma (image / video) ----- */
    if (isLumaAgent) {
      const isVideo =
        agentLower.includes('video') ||
        String(model || '').toLowerCase().startsWith('ray') ||
        Number(req.body.duration_seconds) > 0;

      const chosenModel = ensureLumaModel(model || req.body.model, isVideo);

      const payload = {
        prompt: userMessage,
        model: chosenModel,
        aspect_ratio: req.body.aspect_ratio || '16:9',
        format: isVideo ? (req.body.format || 'mp4') : (req.body.format || 'jpg'),
        ...(req.body.options || {})
      };

      if (isVideo) {
        payload.duration_seconds = Number(req.body.duration_seconds) || 6;
        payload.width  = req.body.width  || 1280;
        payload.height = req.body.height || 720;
      } else {
        payload.width  = req.body.width  || 1024;
        payload.height = req.body.height || 1024;
      }

      const gen = await callLumaGenerate(payload, isVideo);

      const exts = isVideo ? ['.mp4'] : ['.jpg', '.jpeg', '.png', '.webp'];
      const mediaUrl = findUrlWithExt(gen, exts);

      if (mediaUrl) {
        const mediaType = isVideo ? 'video' : 'image';
        chat.messages.push({
          role: 'assistant',
          type: mediaType,
          content: mediaUrl,
          createdAt: new Date().toISOString()
        });
        writeDb(db);
        return res.json({ ok: true, source: 'luma', mediaType, mediaUrl, chat });
      } else {
        const preview = JSON.stringify(gen).slice(0, 2000);
        chat.messages.push({
          role: 'assistant',
          content: preview,
          createdAt: new Date().toISOString()
        });
        writeDb(db);
        return res.json({ ok: true, source: 'luma', reply: preview, chat });
      }
    }

    /* ----- OpenAI path (مع استخدام ويب اختياري) ----- */
    let webContext = '';
    if ((useWebSearch || req.body.useWebSearch) && TAVILY_BASE_URL && TAVILY_API_KEY) {
      try {
        const s = await tavilySearch(userMessage, 5);
        if (s) {
          if (s.answer) webContext = s.answer;
          else if (Array.isArray(s.results)) {
            webContext = s.results.slice(0,4)
              .map(r => `${r.title}\n${r.content || r.snippet || ''}`)
              .join('\n\n');
          } else if (s.data) {
            webContext = JSON.stringify(s.data).slice(0, 2000);
          }
        }
      } catch (err) {
        console.warn('Tavily search failed (non-fatal):', err?.message || err);
      }
    }

    let systemPrompt = `You are MT HUB AI, a helpful assistant. Answer concisely and practically.
If the user writes in Arabic, reply in Arabic. If English, reply in English.`;
    if (webContext) {
      systemPrompt += `\n\nUp-to-date web info:\n${webContext}\n\nUse it if relevant.`;
    }

    const dbMessages = (chat.messages || []).slice(-20).map(m => {
      if (m.role === 'user') return { role: 'user', content: m.content };
      if (m.role === 'assistant' && m.type === 'image')
        return { role: 'assistant', content: `[Image: ${m.content}]` };
      if (m.role === 'assistant' && m.type === 'video')
        return { role: 'assistant', content: `[Video: ${m.content}]` };
      return { role: 'assistant', content: m.content };
    });

    let chosenModel = model || 'gpt-4.1';
    if (agentLower === 'gpt51') chosenModel = model || 'gpt-5.1';
    if (agentLower === 'gpt51-mini' || agentLower === 'gpt-5.1-mini')
      chosenModel = model || 'gpt-5.1-mini';
    if (agentLower === 'nano' || agentLower.includes('nano'))
      chosenModel = model || 'gpt-5-nano';

    const payload = {
      model: chosenModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...dbMessages,
        { role: 'user', content: userMessage }
      ],
      temperature,
      max_tokens
    };

    const openaiResp = await callOpenAIChat(payload);
    let replyText = '';
    if (openaiResp?.choices?.[0]?.message) {
      replyText = openaiResp.choices[0].message.content || '';
    } else if (openaiResp?.choices?.[0]?.text) {
      replyText = openaiResp.choices[0].text;
    } else {
      replyText = JSON.stringify(openaiResp).slice(0, 1500);
    }

    chat.messages.push({
      role: 'assistant',
      content: replyText,
      createdAt: new Date().toISOString()
    });
    chat.updatedAt = new Date().toISOString();
    writeDb(db);

    return res.json({
      ok: true,
      source: webContext ? 'openai+web' : 'openai',
      reply: replyText,
      chat
    });
  } catch (err) {
    console.error('/api/chat failed:', err?.response?.data || err.message || err);
    const detail = err?.response?.data || err?.message || String(err);
    return res.status(500).json({ ok: false, error: 'chat_failed', detail });
  }
});

/* ---------- serve SPA ---------- */
app.get('/social/dashboard', (req, res) => {
  const layout = fs.readFileSync(
    path.join(__dirname, 'social/views/layout.html'),
    'utf8'
  );

  const page = fs.readFileSync(
    path.join(__dirname, 'social/views/social-dashboard.html'),
    'utf8'
  );

  res.send(layout.replace('{{content}}', page));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/ai/index.html'));
});

/* ---------- start server ---------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

  if (!OPENAI_API_KEY)  console.warn('⚠️ OPENAI_API_KEY not set — OpenAI requests will fail.');
  if (!TAVILY_API_KEY)  console.warn('⚠️ TAVILY_API_KEY not set — web search disabled.');
  if (!LUMAAI_API_KEY)  console.warn('⚠️ LUMAAI_API_KEY not set — Luma agents disabled.');