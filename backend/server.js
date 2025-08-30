const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const pdfParse = require("pdf-parse");
const { extractTextFromImage, extractTextFromPdfWithOcr } = require("./utils/ocr");
const { summarizeText, extractKeyPoints } = require("./utils/summarizer");

const app = express();
const upload = multer({ dest: path.join(os.tmpdir(), "docsum_uploads") });

app.use(cors());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

function allowedFile(filename) {
  return /\.(pdf|png|jpg|jpeg|tif|tiff)$/i.test(filename);
}

app.post("/api/summarize", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const length = (req.body.length || "medium").toLowerCase();

    if (!file) {
      return res.status(400).json({ filename: "none", length, summary: "⚠️ No file uploaded.", key_points: [] });
    }
    if (!allowedFile(file.originalname)) {
      return res.status(415).json({ filename: file.originalname, length, summary: "⚠️ Unsupported file type.", key_points: [] });
    }

    let text = "";
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      const buf = fs.readFileSync(file.path);
      const data = await pdfParse(buf);
      text = (data.text || "").trim();

      if (!text) {
        console.log("⚠️ No embedded text in PDF. Trying OCR via Poppler + Tesseract...");
        text = await extractTextFromPdfWithOcr(file.path, 3);
      }
    } else {
      text = await extractTextFromImage(file.path);
    }

    fs.unlink(file.path, () => {});

    console.log("Extracted text length:", text.length);

    if (!text) {
      return res.status(200).json({
        filename: file.originalname,
        length,
        summary: "⚠️ Could not extract text. If this is a scanned PDF, install Poppler and ensure 'pdftoppm' is on PATH, or upload an image/PDF with selectable text.",
        key_points: []
      });
    }

    let summary = summarizeText(text, length);
    if (!summary) summary = text.split(/\n/).slice(0, 5).join(" ");
    const key_points = extractKeyPoints(summary);

    return res.json({ filename: file.originalname, length, summary, key_points });
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ filename: "unknown", length: "medium", summary: "⚠️ " + err.message, key_points: [] });
  }
});

app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
