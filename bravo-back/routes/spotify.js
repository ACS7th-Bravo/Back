// /bravo-back/routes/spotify.js
const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const TOKEN_LIFETIME = 3600; // 1시간 (초 단위)

let accessToken = null;
let tokenExpiresAt = 0;

async function fetchAccessToken() {
  const url = "https://accounts.spotify.com/api/token";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await response.json();
  if (data.access_token) {
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + TOKEN_LIFETIME * 1000;
    console.log("Spotify access token fetched.");
    return accessToken;
  } else {
    throw new Error("Failed to fetch Spotify access token");
  }
}

async function getAccessToken() {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    await fetchAccessToken();
  }
  return accessToken;
}

// 기존 Spotify 검색 엔드포인트 (한국 리전)
// GET /api/spotify/search?q=<검색어>
router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter q is required" });
  }
  try {
    const token = await getAccessToken();
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        query
      )}&type=track&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Accept-Language": "ko-KR", // 한국 리전 정보를 위해
        },
      }
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: "Spotify API error" });
    }
    const data = await response.json();
    // 클라이언트에서는 tracks.items 배열을 사용합니다.
    res.json(data.tracks.items || []);
  } catch (error) {
    console.error("Error in /api/spotify/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 신규 엔드포인트: 특정 트랙의 상세 정보를 미국 리전으로 가져오기
// GET /api/spotify/track?trackId=<트랙ID>&market=US
router.get("/track", async (req, res) => {
  const trackId = req.query.trackId;
  // 기본 market은 미국(US)로 지정
  const market = req.query.market || "US";
  if (!trackId) {
    return res.status(400).json({ error: "trackId parameter is required" });
  }
  try {
    const token = await getAccessToken();
    const response = await fetch(
      `https://api.spotify.com/v1/tracks/${trackId}?market=${market}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: "Spotify API error" });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error in /api/spotify/track:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
