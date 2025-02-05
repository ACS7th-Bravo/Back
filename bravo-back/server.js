import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors"; // ✅ CORS 추가

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // ✅ CORS 허용
app.use(express.json());

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

let spotifyToken = null;
let tokenExpiresAt = 0; // 토큰 만료 시간

// ✅ Spotify API 토큰 가져오기 (자동 갱신)
async function getSpotifyToken() {
  const currentTime = Date.now();

  // 🔹 기존 토큰이 유효하면 사용
  if (spotifyToken && currentTime < tokenExpiresAt) {
    console.log("✅ 기존 Spotify 토큰 사용:", spotifyToken);
    return spotifyToken;
  }

  console.log("🔄 새로운 Spotify 토큰 요청 중...");
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json();

  if (data.access_token) {
    spotifyToken = data.access_token;
    tokenExpiresAt = currentTime + data.expires_in * 1000;
    console.log("✅ 새 Spotify 토큰 발급 완료:", spotifyToken); // 🔥 여기서 콘솔에 출력
    return spotifyToken;
  } else {
    console.error("❌ Spotify 토큰 요청 실패", data);
    throw new Error("Spotify API 토큰을 가져올 수 없습니다.");
  }
}

// ✅ Spotify에서 트랙 검색
app.get("/api/search", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "검색어를 입력하세요." });

  try {
    const token = await getSpotifyToken();
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const data = await response.json();
    res.json(data.tracks.items);
  } catch (error) {
    console.error("❌ Spotify 검색 오류:", error);
    res.status(500).json({ error: "Spotify 검색 중 오류 발생" });
  }
});

// ✅ YouTube에서 트랙 영상 검색
app.get("/api/youtube", async (req, res) => {
  const { track, artist } = req.query;
  if (!track || !artist) return res.status(400).json({ error: "트랙명과 아티스트명을 입력하세요." });

  try {
    const searchQuery = `${track} ${artist} official audio`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&key=${YOUTUBE_API_KEY}&maxResults=1`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.items.length > 0) {
      res.json({ videoId: data.items[0].id.videoId });
    } else {
      res.status(404).json({ error: "YouTube 영상 없음" });
    }
  } catch (error) {
    console.error("❌ YouTube API 오류:", error);
    res.status(500).json({ error: "YouTube 검색 중 오류 발생" });
  }
});

// ✅ 🎯 토큰 확인용 API 추가
app.get("/api/token", async (req, res) => {
  try {
    const token = await getSpotifyToken();
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: "토큰을 가져올 수 없습니다." });
  }
});

// ✅ 서버 실행
app.listen(PORT, () => console.log(`✅ 서버 실행 중: http://localhost:${PORT}`));
