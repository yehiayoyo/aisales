const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

/* =========================
   MIDDLEWARES
========================= */
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   HELPERS
========================= */
function readJSON(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, "utf8");
    if (!data.trim()) return defaultValue;
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ JSON read error:", filePath, err);
    return defaultValue;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/* =========================
   PATHS
========================= */
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const ORDERS_PATH   = path.join(DATA_DIR, "orders.json");
const CHATS_PATH    = path.join(DATA_DIR, "chats.json");
const UGC_PATH      = path.join(DATA_DIR, "ugcCreators.json");
const SESSIONS_PATH = path.join(DATA_DIR, "sessions.json");

/* =========================
   SESSIONS
========================= */
function createSession(creatorId) {
  const sessions = readJSON(SESSIONS_PATH);
  const token = crypto.randomBytes(32).toString("hex");

  sessions.push({
    token,
    creatorId,
    createdAt: Date.now()
  });

  writeJSON(SESSIONS_PATH, sessions);
  return token;
}

function getCreatorFromSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;

  const token = match[1];
  const sessions = readJSON(SESSIONS_PATH);
  const session = sessions.find(s => s.token === token);
  if (!session) return null;

  const creators = readJSON(UGC_PATH);
  return creators.find(c => String(c.id) === String(session.creatorId));
}

/* =========================
   CREATOR AUTH API
========================= */

// 📝 Signup
app.post("/api/creator/signup", (req, res) => {
  const creators = readJSON(UGC_PATH);
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: "Missing fields" });

  if (creators.find(c => c.email === email))
    return res.status(400).json({ error: "Email already exists" });

  const creator = {
    id: Date.now().toString(),
    name,
    email,
    password,
    createdAt: new Date().toISOString()
  };

  creators.push(creator);
  writeJSON(UGC_PATH, creators);

  const token = createSession(creator.id);
  res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly`);

  res.json({ success: true });
});

// 🔐 Login
app.post("/api/creator/login", (req, res) => {
  const creators = readJSON(UGC_PATH);
  const { email, password } = req.body;

  const creator = creators.find(
    c => c.email === email && c.password === password
  );

  if (!creator)
    return res.status(401).json({ error: "Invalid credentials" });

  const token = createSession(creator.id);
  res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly`);

  res.json({ success: true });
});

// 🚪 Logout
app.post("/api/creator/logout", (req, res) => {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);

  if (match) {
    const token = match[1];
    const sessions = readJSON(SESSIONS_PATH).filter(
      s => s.token !== token
    );
    writeJSON(SESSIONS_PATH, sessions);
  }

  res.setHeader("Set-Cookie", "session=; Max-Age=0; Path=/");
  res.json({ success: true });
});

/* =========================
   ORDERS API
========================= */

// 🧾 إنشاء طلب
app.post("/api/orders", (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const { creatorId, requirements } = req.body;

  if (!creatorId)
    return res.status(400).json({ error: "creatorId is required" });

  const order = {
    id: Date.now().toString(),
    buyerId: 1, // مؤقت
    creatorId: String(creatorId),

    status: "unpaid", // unpaid | paid | in_progress | delivered | completed
    createdAt: new Date().toISOString(),
    paidAt: null,

    requirements: requirements || [],
    revisionsLeft: 5,

    delivery: {
      videoUrl: null,
      note: null,
      deliveredAt: null
    }
  };

  orders.push(order);
  writeJSON(ORDERS_PATH, orders);

  res.json(order);
});

// 💳 الدفع
app.post("/api/orders/:id/pay", (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const order = orders.find(o => o.id === req.params.id);

  if (!order)
    return res.status(404).json({ error: "Order not found" });

  order.status = "paid";
  order.paidAt = new Date().toISOString();

  writeJSON(ORDERS_PATH, orders);
  res.json({ success: true });
});

/* =========================
   🧩 ORDER FLOW
========================= */

// 1️⃣ الكريتور يسلّم الفيديو
app.post("/api/orders/:id/deliver", (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const order = orders.find(o => o.id === req.params.id);

  if (!order)
    return res.status(404).json({ error: "Order not found" });

  // ✅ الجديد – الشات يفتح دايمًا
// ممنوع الإرسال فقط بعد completed

  const { videoUrl, note } = req.body;
  if (!videoUrl)
    return res.status(400).json({ error: "videoUrl required" });

  order.status = "delivered";
  order.delivery = {
    videoUrl,
    note: note || "",
    deliveredAt: new Date().toISOString()
  };

  // 💬 تسجيل رسالة تسليم في الشات
  const chats = readJSON(CHATS_PATH);

  let chat = chats.find(c => c.orderId === order.id);
  if (!chat) {
    chat = {
      id: Date.now().toString(),
      orderId: order.id,
      buyerId: order.buyerId,
      creatorId: order.creatorId,
      messages: []
    };
    chats.push(chat);
  }

  chat.messages.push({
    sender: "creator",
    text: `📦 تم تسليم الفيديو\n🔗 ${videoUrl}\n📝 ${note || "بدون ملاحظات"}`,
    time: new Date().toISOString()
  });

  writeJSON(CHATS_PATH, chats);
  writeJSON(ORDERS_PATH, orders);

  res.json({ success: true });
});

// 2️⃣ العميل يوافق على الفيديو
app.post("/api/orders/:id/approve", (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const order = orders.find(o => o.id === req.params.id);

  if (!order)
    return res.status(404).json({ error: "Order not found" });

  if (order.status !== "delivered")
    return res.status(400).json({ error: "Order not delivered yet" });

  order.status = "completed";

  // 💬 رسالة إغلاق
  const chats = readJSON(CHATS_PATH);
  const chat = chats.find(c => c.orderId === order.id);

  if (chat) {
    chat.messages.push({
      sender: "system",
      text: "✅ تم اعتماد الفيديو وإغلاق الطلب",
      time: new Date().toISOString()
    });
    writeJSON(CHATS_PATH, chats);
  }

  writeJSON(ORDERS_PATH, orders);
  res.json({ success: true });
});

// 3️⃣ العميل يطلب تعديل
app.post("/api/orders/:id/revision", (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const order = orders.find(o => o.id === req.params.id);

  if (!order)
    return res.status(404).json({ error: "Order not found" });

  if (order.status !== "delivered")
    return res.status(400).json({ error: "Order not delivered" });

  const { note, failedRequirement } = req.body;
  if (!note)
    return res.status(400).json({ error: "Revision note required" });

  if (!failedRequirement) {
    if (order.revisionsLeft <= 0)
      return res.status(403).json({ error: "No revisions left" });

    order.revisionsLeft--;
  }

  order.status = "in_progress";

  // 💬 تسجيل التعديل في الشات
  const chats = readJSON(CHATS_PATH);
  const chat = chats.find(c => c.orderId === order.id);

  if (chat) {
    chat.messages.push({
      sender: "buyer",
      text: `🔁 تعديل مطلوب: ${note}`,
      time: new Date().toISOString()
    });
    writeJSON(CHATS_PATH, chats);
  }

  writeJSON(ORDERS_PATH, orders);
  res.json({ revisionsLeft: order.revisionsLeft });
});

/* =========================
   CHAT API
========================= */
app.get("/api/chat/order/:orderId", (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const chats = readJSON(CHATS_PATH);

  const order = orders.find(o => o.id === req.params.orderId);
  if (!order)
    return res.status(404).json({ error: "Order not found" });

  let chat = chats.find(c => c.orderId === order.id);

  // إنشاء شات لو مش موجود
  if (!chat) {
    chat = {
      id: Date.now().toString(),
      orderId: order.id,
      buyerId: order.buyerId,
      creatorId: order.creatorId,
      messages: [
        {
          sender: "system",
          text: "💬 تم فتح المحادثة بين العميل والكريتور",
          time: new Date().toISOString()
        }
      ]
    };

    chats.push(chat);
    writeJSON(CHATS_PATH, chats);
  }

  // ✅ الدخول مسموح دايمًا
  res.json({
    ...chat,
    order
  });
});



/* =========================

   UGC API
========================= */
app.get("/api/ugc", (req, res) => {
  res.json(readJSON(UGC_PATH));
});

app.get("/api/ugc/:id", (req, res) => {
  const creators = readJSON(UGC_PATH);
  const creator = creators.find(c => String(c.id) === req.params.id);
  if (!creator)
    return res.status(404).json({ error: "Creator not found" });
  res.json(creator);
});

/* =========================
   CREATOR API
========================= */
app.get("/api/creator/:creatorId/orders", (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  const myOrders = orders.filter(
    o => String(o.creatorId) === String(req.params.creatorId)
  );
  res.json(myOrders);
});

/* =========================
   PAGES
========================= */

// 🏠 الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "ai", "index.html"));
});

// 🎥 ماركت UGC
app.get("/ugc", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "ugc", "index.html"));
});



// 🎛️ Creator Dashboard (لازم قبل أي /creator/:id)
app.get("/creator/dashboard/:creatorid", (req, res) => {
  res.sendFile(
    path.join(__dirname, "views", "creator", "dashboard.html")
  );
});

app.post("/api/chat/order/:orderId/send", (req, res) => {
  const chats  = readJSON(CHATS_PATH);
  const orders = readJSON(ORDERS_PATH);

  const order = orders.find(o => o.id === req.params.orderId);
  if (!order)
    return res.status(404).json({ error: "Order not found" });

  // 🔒 قفل الإرسال بعد اكتمال الطلب
  if (order.status === "completed") {
    return res.status(403).json({
      error: "🔒 المحادثة مغلقة – الطلب مكتمل"
    });
  }

  const chat = chats.find(c => c.orderId === order.id);
  if (!chat)
    return res.status(404).json({ error: "Chat not found" });

  const { message } = req.body;
  if (!message || !message.trim())
    return res.status(400).json({ error: "Empty message" });

  // 🚫 منع مشاركة وسائل تواصل
  const phoneRegex = /(\d[\s\-]*){6,}/;
  const socialRegex =
    /(whatsapp|wa\.me|facebook|instagram|telegram|t\.me|snap|tik)/i;

  if (phoneRegex.test(message) || socialRegex.test(message)) {
    return res.status(403).json({
      error: "❌ ممنوع مشاركة وسائل تواصل خارج المنصة"
    });
  }

  // ✅ تحديد المرسل بشكل صحيح
  let sender = "buyer";
  if (req.query.role === "creator") sender = "creator";

  chat.messages.push({
    sender,
    text: message,
    time: new Date().toISOString()
  });

  writeJSON(CHATS_PATH, chats);
  res.json({ success: true });
});

// 👤 بروفايل كريتور
app.get("/ugc/:id", (req, res) => {
  res.sendFile(
    path.join(__dirname, "views", "ugc", "profile.html")
  );
});

// 💳 صفحة الدفع
app.get("/pay/:orderId", (req, res) => {
  res.sendFile(
    path.join(__dirname, "views", "pay", "index.html")
  );
});

// 💬 صفحة الشات
app.get("/chat/:orderId", (req, res) => {
  res.sendFile(
    path.join(__dirname, "views", "chat", "index.html")
  );
});

/* =========================
   CREATOR AUTH PAGES
========================= */

// 📝 Creator Signup
app.get("/creatorauth/creator-signup", (req, res) => {
  res.sendFile(
    path.join(__dirname, "views", "creatorauth", "creator-signup.html")
  );
});

// 🔐 Creator Login
app.get("/creatorauth/creator-login", (req, res) => {
  res.sendFile(
    path.join(__dirname, "views", "creatorauth", "creator-login.html")
  );
});

// 🎛️ Creator Dashboard (محمي)
app.get("/creator/dashboard", (req, res) => {
  const creator = getCreatorFromSession(req);
  if (!creator) {
    return res.redirect("/creatorauth/creator-login");
  }

  res.sendFile(
    path.join(__dirname, "views", "creator", "dashboard.html")
  );
});



/* =========================
   SERVER
========================= */
app.listen(4000, () => {
  console.log("✅ Server running on http://localhost:4000");
});