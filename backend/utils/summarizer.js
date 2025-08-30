function splitSentences(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function wordFrequency(text) {
  const stop = new Set(("a an the is are was were be been being of and or to in on for at by with from as that this these those it its into over under between above below you your our we they them he she his her theirs ours what which who whom whose not no yes do does did done than then there here how why when where also too just can will may might must should could would").split(/\s+/));
  const words = (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter(w => !stop.has(w));
  const f = {};
  for (const w of words) f[w] = (f[w] || 0) + 1;
  return f;
}

function scoreSentence(sent, freq) {
  const words = (sent.toLowerCase().match(/[a-z0-9']+/g) || []);
  let s = 0;
  for (const w of words) s += (freq[w] || 0);
  return s / Math.max(4, words.length);
}

function sentencesToKeepCount(nSent, length) {
  if (length === "short") return Math.max(1, Math.ceil(nSent * 0.1));
  if (length === "long")  return Math.max(5, Math.ceil(nSent * 0.35));
  return Math.max(3, Math.ceil(nSent * 0.2)); // medium
}

function summarizeText(text, length="medium") {
  const sentences = splitSentences(text);
  if (!sentences.length) return "";

  const freq = wordFrequency(text);
  const scored = sentences.map((s, i) => ({ i, s, score: scoreSentence(s, freq) }));
  scored.sort((a, b) => b.score - a.score);

  const keep = sentencesToKeepCount(sentences.length, length);
  const picked = scored.slice(0, keep).sort((a, b) => a.i - b.i).map(x => x.s);
  return picked.join(" ");
}

function topKeywords(text, k=5) {
  const f = wordFrequency(text);
  return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0, k).map(([w]) => w);
}

function extractKeyPoints(summary) {
  const sents = splitSentences(summary);
  const bullets = [];

  // Prefer short summary sentences
  for (const s of sents) {
    if (s.length <= 160) bullets.push(s);
    if (bullets.length >= 5) break;
  }

  // If not enough, add keywords naturally
  if (bullets.length < 5) {
    const kws = topKeywords(summary, 8);
    for (const w of kws) {
      bullets.push(`Covers ${w}`);
      if (bullets.length >= 5) break;
    }
  }

  return bullets.slice(0, 5);
}

module.exports = { summarizeText, extractKeyPoints };
