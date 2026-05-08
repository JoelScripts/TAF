const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const AWC_BASE = "https://aviationweather.gov/api/data/taf";

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/taf/")) {
      const icao = decodeURIComponent(url.pathname.split("/").pop() || "").toUpperCase();
      await handleTaf(icao, res);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: "Server error while handling the request." });
  }
});

async function handleTaf(icao, res) {
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    sendJson(res, 400, { error: "Enter a valid four-character ICAO airport code." });
    return;
  }

  const jsonUrl = `${AWC_BASE}?ids=${encodeURIComponent(icao)}&format=json`;
  const response = await fetch(jsonUrl, {
    headers: {
      "User-Agent": "Local TAF Decoder Website/1.0 (educational use)"
    }
  });

  if (response.status === 204) {
    sendJson(res, 404, { error: `No recent TAF was found for ${icao}.` });
    return;
  }

  if (!response.ok) {
    sendJson(res, response.status, { error: `Aviation Weather returned HTTP ${response.status}.` });
    return;
  }

  const text = await response.text();
  let report = null;

  try {
    const parsed = JSON.parse(text);
    report = Array.isArray(parsed) ? parsed[0] : parsed?.data?.[0] || parsed;
  } catch {
    report = { rawTAF: text.trim() };
  }

  const raw = extractRawTaf(report);
  if (!raw) {
    sendJson(res, 404, { error: `The response for ${icao} did not include a readable TAF.` });
    return;
  }

  sendJson(res, 200, {
    station: report.icaoId || report.stationId || report.station_id || icao,
    raw,
    issueTime: report.issueTime || report.issue_time || report.issuance_time || null,
    receiptTime: report.receiptTime || report.receipt_time || report.validTimeFrom || null,
    source: "NOAA Aviation Weather Center"
  });
}

function extractRawTaf(report) {
  if (!report) return "";

  const candidates = [
    report.rawTAF,
    report.rawTaf,
    report.raw_text,
    report.rawText,
    report.taf,
    report.text
  ];

  const raw = candidates.find((value) => typeof value === "string" && value.trim());
  if (raw) return raw.replace(/\s+/g, " ").trim();

  if (typeof report === "string") {
    return report.replace(/\s+/g, " ").trim();
  }

  return "";
}

function serveStatic(requestPath, res) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(ROOT, safePath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[ext] || "application/octet-stream";
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`TAF Decoder running at http://localhost:${PORT}`);
});
