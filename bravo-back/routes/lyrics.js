import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_API_HOST = process.env.MUSIXMATCH_API_HOST || "musixmatch-lyrics-songs.p.rapidapi.com";

function cleanQueryString(str) {
  return str
    .replace(/\(.*?\)/g, '')
    .replace(/feat\./gi, '')
    .replace(/’/g, "'")
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toLowerCase();
}

async function fetchLyrics(song, artist, retries = 3) {
  const cleanSong = cleanQueryString(song);
  const cleanArtist = cleanQueryString(artist);

  const url = "https://musixmatch-lyrics-songs.p.rapidapi.com/songs/lyrics";
  const querystring = new URLSearchParams({ t: cleanSong, a: cleanArtist, type: "json" });

  const headers = {
    "x-rapidapi-key": MUSIXMATCH_API_KEY,
    "x-rapidapi-host": MUSIXMATCH_API_HOST
  };

  let attempt = 0;
  while (attempt < retries) {
    try {
      console.log(`📡 [백엔드] Musixmatch API 요청 (시도 ${attempt + 1}): ${url}?${querystring}`);
      const response = await fetch(`${url}?${querystring}`, { headers });
      if (!response.ok) {
        console.error(`❌ [백엔드] Musixmatch API 오류 (HTTP ${response.status})`);
        attempt++;
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }
      const data = await response.json();
      if (!data || data.error || !data.length) {
        console.warn("⚠️ [백엔드] 가사 데이터를 찾을 수 없음. 재시도...");
        attempt++;
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }
      if (Array.isArray(data)) {
        return data.map(line => line.text).join('\n');
      }
      const lyrics = data.message?.body?.lyrics?.lyrics_body;
      if (lyrics) {
        return lyrics;
      }
    } catch (error) {
      console.error(`❌ [백엔드] API 호출 중 오류 발생 (시도 ${attempt + 1}):`, error);
      attempt++;
      await new Promise(res => setTimeout(res, 1000));
    }
  }
  return null;
}

router.get('/', async (req, res) => {
  console.log("📢 [백엔드] /api/lyrics 요청 받음");
  console.log("👉 받은 쿼리 파라미터:", req.query);

  const { song, artist } = req.query;
  if (!song || !artist) {
    console.error("❌ [백엔드] 요청 실패: song 또는 artist 누락");
    return res.status(400).json({ error: "곡명(song)과 아티스트명(artist)을 입력하세요." });
  }

  const lyrics = await fetchLyrics(song, artist);
  if (!lyrics) {
    return res.status(404).json({ error: "Musixmatch 서버에 가사가 존재하지 않거나, 여러 번 요청했지만 데이터를 찾을 수 없습니다." });
  }

  res.json({ song, artist, lyrics });
});

export default router;
