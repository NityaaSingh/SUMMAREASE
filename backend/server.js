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

function allowedFile(filename) {
  return /\.(pdf|png|jpg|jpeg|tif|tiff)$/i.test(filename);
}

app.post("/api/summarize", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const length = (req.body.length || "medium").toLowerCase();
    const mode = req.body.mode || "rule";

    if (!file) {
      return res.status(400).json({ summary: "⚠️ No file uploaded.", key_points: [] });
    }
    if (!allowedFile(file.originalname)) {
      return res.status(415).json({ summary: "⚠️ Unsupported file type.", key_points: [] });
    }

    // --- Extract text ---
    let text = "";
    let numPages = 0;

    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      const buf = fs.readFileSync(file.path);
      const data = await pdfParse(buf);
      text = (data.text || "").trim();
      numPages = data.numpages || 0;

      if (!text) {
        console.log("⚠️ No embedded text in PDF. Using OCR...");
        text = await extractTextFromPdfWithOcr(file.path, 3);
      }
    } else {
      text = await extractTextFromImage(file.path);
    }

    fs.unlink(file.path, () => {}); // cleanup

    if (!text) {
      return res.json({
        filename: file.originalname,
        length,
        summary: "⚠️ Could not extract text from file.",
        key_points: []
      });
    }

    // --- Summarization ---
    let summary;
    if (mode === "ai") {
      summary = await aiSummarize(text, length);

      // Enforce limit: If PDF has >3 pages, cap summary at 2000 words
      if (numPages > 3) {
        const words = summary.split(/\s+/);
        if (words.length > 2000) {
          summary = words.slice(0, 2000).join(" ") + " …";
        }
      }
    } else {
      summary = summarizeText(text, length);
    }

    if (!summary) summary = text.split(/\n/).slice(0, 5).join(" ");

    const key_points = extractKeyPoints(summary);

    return res.json({ filename: file.originalname, length, summary, key_points, mode, pages: numPages });
  } catch (err) {
    console.error("Route error:", err);
    return res.status(500).json({ summary: "⚠️ " + err.message, key_points: [] });
  }
});

app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
