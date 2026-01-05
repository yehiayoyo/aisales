import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";

dotenv.config();

/* ================================
   Paths
================================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================================
   Persistent Files
================================ */
const productsFile = "./products.json";
const memoryFile = "./sales_memory.json";

/* ================================
   Load Persistent Data
================================ */
let products = fs.existsSync(productsFile)
  ? JSON.parse(fs.readFileSync(productsFile, "utf-8"))
  : [];

let salesMemory = fs.existsSync(memoryFile)
  ? JSON.parse(fs.readFileSync(memoryFile, "utf-8"))
  : [];

/* ================================
   Server
================================ */
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

/* ================================
   Uploads
================================ */
const uploadDir = path.join(__dirname, "uploads/products");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ================================
   OpenAI
================================ */
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

/* ================================
   Smart Product Matcher
================================ */
function smartMatchProducts(message, products) {
  const msg = message.toLowerCase();
  const scored = [];

  for (const p of products) {
    let score = 0;
    const name = p.name.toLowerCase();
    const desc = (p.description || "").toLowerCase();

    if (msg.includes(name)) score += 6;

    name.split(" ").forEach(w => {
      if (w.length > 3 && msg.includes(w)) score += 3;
    });

    desc.split(" ").forEach(w => {
      if (w.length > 3 && msg.includes(w)) score += 1;
    });

    if (/خلاط|ميكسر|عصير|تحضير|مطبخ/.test(msg) && /mixer|خلاط/.test(name)) {
      score += 5;
    }

    if (score > 0) {
      scored.push({ product: p, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.product);
}

/* ================================
   Sales States
================================ */
const SALES_STATES = {
  DISCOVERY: "discovery",
  QUALIFICATION: "qualification",
  OBJECTION: "objection",
  CLOSING: "closing",
  WON: "won",
  LOST: "lost"
};

const sessions = {};

/* ================================
   Multer
================================ */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

/* ================================
   Chat Page
================================ */
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* ================================
   Dashboard
================================ */
app.get("/dashboard", (_, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

/* ================================
   Save Product
================================ */
app.post("/api/products", upload.array("images", 10), (req, res) => {
  const { name, price, category, description } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "اسم المنتج والسعر مطلوبين" });
  }

  const images = req.files
    ? req.files.map(f => "/uploads/products/" + f.filename)
    : [];

  const product = {
    id: Date.now().toString(),
    name,
    price,
    category,
    description,
    images
  };

  products.push(product);
  fs.writeFileSync(productsFile, JSON.stringify(products, null, 2));

  res.json({ success: true, product });
});

/* ================================
   Get Products
================================ */
app.get("/api/products", (_, res) => {
  res.json(products);
});

/* ================================
   AI CHAT (FINAL)
================================ */
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "";
    const sessionId = req.body.sessionId || "default";

    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        state: SALES_STATES.DISCOVERY,
        attempts: 0,
        objections: []
      };
    }

    const session = sessions[sessionId];
    const msg = userMessage.toLowerCase();

    if (/سعر|كام|بكام/.test(msg)) session.state = SALES_STATES.QUALIFICATION;
    if (/غالي|مش متأكد|بعديها/.test(msg)) {
      session.state = SALES_STATES.OBJECTION;
      session.objections.push(userMessage);
    }
    if (/اشتري|تمام|موافق|عايز/.test(msg)) {
      session.state = SALES_STATES.CLOSING;
    }

    const matchedProducts = smartMatchProducts(userMessage, products);
    const images = matchedProducts.flatMap(p => p.images || []);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
أنت AI Sales Agent محترف.
حالة العميل: ${session.state}
اسأل سؤال واحد فقط.
اقفل البيع بهدوء في closing.

المنتجات:
${products.map(p => `- ${p.name}: ${p.description}`).join("\n")}

الاعتراضات:
${session.objections.join("\n") || "لا يوجد"}
          `
        },
        { role: "user", content: userMessage }
      ]
    });

    let replyText = response.choices[0].message.content;

    const buyingSignals = ["سعر", "بكام", "ضمان", "شحن", "مناسب", "أفضل"];
    const hasIntent = buyingSignals.some(w => msg.includes(w));

    const primaryProduct = matchedProducts[0];

    if (hasIntent && primaryProduct) {
      replyText += `

🛒 هل تحب أحجز لك المنتج الآن؟
📦 السعر: ${primaryProduct.price} جنيه
🚚 شحن سريع داخل مصر
`;
    }

    salesMemory.push({
      message: userMessage,
      shownProducts: matchedProducts.map(p => p.name),
      timestamp: Date.now()
    });

    fs.writeFileSync(memoryFile, JSON.stringify(salesMemory, null, 2));

    res.json({
      reply: replyText,
      images
    });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ error: "AI Error" });
  }
});

/* ================================
   Run
================================ */
app.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on http://0.0.0.0:5000");
});