// /bravo-back/routes/spotify.js
import express from "express";
import fetch from "node-fetch";
import dotenv from 'dotenv';


dotenv.config()

const router = express.Router();

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

// GET /api/spotify/search?q=<검색어>
router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Query parameter q is required" });
  }
  try {
    const token = await getAccessToken();
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`,
      {
        headers: { Authorization: `Bearer ${token}`}
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


export default router;