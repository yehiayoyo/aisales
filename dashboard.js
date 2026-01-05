import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// =======================
// إعدادات أساسية
// =======================
const app = express();
const PORT = 2000;

// عشان __dirname يشتغل مع ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =======================
// Middlewares
// =======================
app.use(express.json());               // قراءة JSON
app.use(express.static(__dirname));    // يخدم HTML / CSS / JS

// =======================
// Routes (الصفحات)
// =======================

// الصفحة الرئيسية (ممكن تخليها chat.html بعدين)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// الداشبورد
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// =======================
// API (مخزن منتجات بسيط)
// =======================
let products = [];

app.post("/api/products", (req, res) => {
  const { name, price, category, description } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "الاسم والسعر مطلوبين" });
  }

  const product = {
    id: Date.now(),
    name,
    price,
    category,
    description
  };

  products.push(product);
  console.log("✅ Product added:", product);

  res.json({ success: true, product });
});

app.get("/api/products", (req, res) => {
  res.json(products);
});

// =======================
// تشغيل السيرفر
// =======================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});