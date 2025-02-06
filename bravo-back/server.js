import express from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import querystring from 'querystring';
import fetch from 'node-fetch';
import crypto from 'crypto';

dotenv.config();

// 디버깅: 환경 변수 값 출력 (프로덕션에서는 제거)
console.log("🔍 GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);
console.log("🔍 JWT_SECRET:", process.env.JWT_SECRET);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CSP 헤더 설정
const generateNonce = () => crypto.randomBytes(16).toString('base64');
app.use((req, res, next) => {
  const nonce = generateNonce();
  res.setHeader('Content-Security-Policy', `script-src 'nonce-${nonce}' 'self';`);
  res.locals.nonce = nonce;
  next();
});

const corsOptions = {
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));

const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google-callback";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// 여러 개의 YouTube API 키 (라운드 로빈)
const API_KEYS = [
  process.env.YOUTUBE_API_KEY1,
  process.env.YOUTUBE_API_KEY2,
  process.env.YOUTUBE_API_KEY3,
  process.env.YOUTUBE_API_KEY4,
  process.env.YOUTUBE_API_KEY5,
  process.env.YOUTUBE_API_KEY6,
  process.env.YOUTUBE_API_KEY7,
];
let apiKeyIndex = 0;
function getNextApiKey() {
  const apiKey = API_KEYS[apiKeyIndex];
  apiKeyIndex = (apiKeyIndex + 1) % API_KEYS.length;
  return apiKey;
}

// 임시 DB (실제 프로젝트에서는 DB 사용)
const users = [];

// Google OAuth 로그인
app.get("/api/google-login", (req, res) => {
  const authUrl = `https://accounts.google.com/o/oauth2/auth?${querystring.stringify({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
  })}`;
  res.redirect(authUrl);
});

// Google OAuth 콜백 (토큰 교환 및 JWT 발급)
app.get("/api/google-callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: "Google OAuth 코드가 없습니다." });

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET, // 명시적으로 추가
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      
      const tokens = await tokenResponse.json();
      console.log("✅ Google OAuth Tokens:", tokens);
      
      if (!tokens.access_token) {
        throw new Error("Google OAuth 토큰 발급 실패: " + JSON.stringify(tokens));
      }
      

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;

    let user = users.find((u) => u.email === email);
    if (!user) {
      user = { email, name: payload.name, picture: payload.picture, password: null };
      users.push(user);
    }

    const jwtToken = jwt.sign({ email, name: payload.name, picture: payload.picture }, JWT_SECRET, { expiresIn: "7d" });
    console.log("✅ 발급된 JWT:", jwtToken);
    
    // 한 번만 리디렉션
    res.redirect(`http://localhost:5173?token=${jwtToken}`);
  } catch (error) {
    console.error("❌ Google OAuth 로그인 실패:", error);
    res.status(500).json({ error: "Google OAuth 로그인 실패", details: error });
  }
});

// JWT 토큰 검증 API
app.get("/api/verify-token", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ valid: false });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
});

// Spotify API 토큰 관리 및 트랙 검색
let spotifyToken = null;
let tokenExpiresAt = 0;
async function getSpotifyToken() {
  const currentTime = Date.now();
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
    console.log("✅ 새 Spotify 토큰 발급 완료:", spotifyToken);
    return spotifyToken;
  } else {
    console.error("❌ Spotify 토큰 요청 실패", data);
    throw new Error("Spotify API 토큰을 가져올 수 없습니다.");
  }
}

app.get("/api/search", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "검색어를 입력하세요." });
  try {
    const token = await getSpotifyToken();
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=40`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    res.json(data.tracks.items);
  } catch (error) {
    console.error("❌ Spotify 검색 오류:", error);
    res.status(500).json({ error: "Spotify 검색 중 오류 발생" });
  }
});

// YouTube 검색 API (라운드 로빈 방식)
app.get("/api/youtube", async (req, res) => {
  const { track, artist } = req.query;
  if (!track || !artist) return res.status(400).json({ error: "트랙명과 아티스트명을 입력하세요." });
  try {
    const searchQuery = `${track} ${artist} official audio`;
    const apiKey = getNextApiKey();
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&key=${apiKey}&maxResults=1`;
    console.log(`🔍 YouTube 검색 요청 (API Key: ${apiKeyIndex + 1}번 키)`, url);
    const response = await fetch(url);
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      res.json({ videoId: data.items[0].id.videoId });
    } else {
      res.status(404).json({ error: "YouTube 영상 없음" });
    }
  } catch (error) {
    console.error("❌ YouTube API 오류:", error);
    res.status(500).json({ error: "YouTube 검색 중 오류 발생" });
  }
});

app.listen(PORT, () => console.log(`✅ 서버 실행 중: http://localhost:${PORT}`));
