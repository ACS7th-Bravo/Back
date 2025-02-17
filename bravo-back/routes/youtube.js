// /bravo-back/routes/youtube.js
import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const youtubeApiKeys = process.env.YOUTUBE_API_KEYS.split(",");
let currentApiKeyIndex = 0;
let currentApiKey = youtubeApiKeys[currentApiKeyIndex];

// API 키 로테이션 함수
function rotateApiKey() {
  currentApiKeyIndex = (currentApiKeyIndex + 1) % youtubeApiKeys.length;
  currentApiKey = youtubeApiKeys[currentApiKeyIndex];
  console.log(
    `[🔄 ${new Date().toLocaleString()}]  ${currentApiKeyIndex + 1}번째 YouTube API 키 변경됨: ${currentApiKey}`
  );
}

// GET /api/youtube/search?trackName=...&artistName=...
router.get("/search", async (req, res) => {
  // 요청 시마다 API 키를 라운드로빈 방식으로 변경
  rotateApiKey();

  const { trackName, artistName } = req.query;
  if (!trackName || !artistName) {
    return res
      .status(400)
      .json({ error: "trackName and artistName parameters are required" });
  }
  const searchQueryText = `${trackName} ${artistName} official audio`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&regionCode=KR&safeSearch=none&q=${encodeURIComponent(
    searchQueryText
  )}&key=${currentApiKey}&maxResults=1`;
  
  console.log(url);
  

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: "YouTube API error" });
    }
    const data = await response.json();
    const videoId =
      data.items && data.items.length > 0 ? data.items[0].id.videoId : null;
    res.json({ videoId });
  } catch (error) {
    console.error("Error in /api/youtube/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
