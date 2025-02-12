// /bravo-back/routes/lyrics.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const LRCLIB_API_BASE = process.env.LRCLIB_API_BASE || "http://localhost:3000";
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_API_HOST = process.env.MUSIXMATCH_API_HOST || "musixmatch-lyrics-songs.p.rapidapi.com";

/**
 * 문자열 정리 함수 (필요시 확장 가능)
 */
function cleanQueryString(str) {
  return str.replace(/’/g, "'").trim();
}

/**
 * LRCLIB의 /api/get 엔드포인트를 단일 시도로 호출합니다.
 * 404나 '찾을 수 없음' 응답이면 바로 null 반환합니다.
 */
async function fetchLyricsLrcLib(song, artist, album = null, duration = null, retries = 1) {
  const cleanSong = cleanQueryString(song);
  const cleanArtist = cleanQueryString(artist);

  const queryParams = new URLSearchParams({
    track_name: cleanSong,
    artist_name: cleanArtist
  });
  if (album) queryParams.append("album_name", cleanQueryString(album));
  if (duration) queryParams.append("duration", duration.toString());

  const url = `${LRCLIB_API_BASE}/api/get`;
  try {
    console.log(`📡 [백엔드] LRCLIB API 요청: ${url}?${queryParams}`);
    const response = await fetch(`${url}?${queryParams}`);
    
    if (response.status === 404) {
      console.warn("⚠️ [백엔드] LRCLIB API 404 응답: 트랙을 찾지 못했습니다.");
      return null;
    }
    
    if (!response.ok) {
      console.error(`❌ [백엔드] LRCLIB API 오류 (HTTP ${response.status})`);
      return null;
    }
    
    const data = await response.json();
    if (data.code === 404) {
      console.warn("⚠️ [백엔드] LRCLIB: 트랙을 찾지 못했습니다. (data.code === 404)");
      return null;
    }
    
    if (data.syncedLyrics) {
      return data.syncedLyrics;
    } else if (data.plainLyrics) {
      return data.plainLyrics;
    }
  } catch (error) {
    console.error(`❌ [백엔드] LRCLIB API 호출 중 오류 발생:`, error);
  }
  return null;
}

/**
 * Musixmatch API를 단일 시도로 호출합니다.
 * 404나 오류 발생 시 바로 null 반환합니다.
 */
async function fetchLyricsMusixmatch(song, artist, retries = 1) {
  const cleanSong = cleanQueryString(song);
  const cleanArtist = cleanQueryString(artist);
  const url = "https://musixmatch-lyrics-songs.p.rapidapi.com/songs/lyrics";
  const querystring = new URLSearchParams({
    t: cleanSong,
    a: cleanArtist,
    type: "json"
  });
  const headers = {
    "x-rapidapi-key": MUSIXMATCH_API_KEY,
    "x-rapidapi-host": MUSIXMATCH_API_HOST
  };

  try {
    console.log(`📡 [백엔드] Musixmatch API 요청: ${url}?${querystring}`);
    const response = await fetch(`${url}?${querystring}`, { headers });
    
    if (response.status === 404) {
      console.warn("⚠️ [백엔드] Musixmatch API 404 응답: 가사를 찾지 못했습니다.");
      return null;
    }
    
    if (!response.ok) {
      console.error(`❌ [백엔드] Musixmatch API 오류 (HTTP ${response.status})`);
      return null;
    }
    
    const data = await response.json();
    if (!data || data.error) {
      console.warn("⚠️ [백엔드] Musixmatch에서 가사 데이터를 찾지 못했습니다.");
      return null;
    }
    
    if (Array.isArray(data)) {
      return data.map(line => line.text).join('\n');
    }
    
    const lyrics = data.message?.body?.lyrics?.lyrics_body;
    if (lyrics) {
      return lyrics;
    }
  } catch (error) {
    console.error(`❌ [백엔드] Musixmatch API 호출 중 오류 발생:`, error);
  }
  return null;
}

router.get('/', async (req, res) => {
  console.log("📢 [백엔드] /api/lyrics 요청 받음");
  console.log("👉 받은 쿼리 파라미터:", req.query);

  const { song, artist, album, duration } = req.query;
  if (!song || !artist) {
    console.error("❌ [백엔드] 요청 실패: song 또는 artist 누락");
    return res.status(400).json({ error: "곡명(song)과 아티스트명(artist)을 입력하세요." });
  }

  let lyrics = null;

  // LRCLIB API 2회 시도
  for (let i = 0; i < 2; i++) {
    console.log(`📡 [백엔드] LRCLIB API 시도 ${i + 1}번째`);
    lyrics = await fetchLyricsLrcLib(song, artist, album, duration, 1); // 단일 시도로 호출
    if (lyrics) break;
    // 시도 간 1초 대기
    await new Promise(res => setTimeout(res, 1000));
  }

  // LRCLIB에서 가사를 찾지 못하면 Musixmatch API 2회 시도
  if (!lyrics) {
    console.warn("⚠️ [백엔드] LRCLIB에서 가사를 찾지 못했습니다. Musixmatch API를 호출합니다.");
    for (let i = 0; i < 2; i++) {
      console.log(`📡 [백엔드] Musixmatch API 시도 ${i + 1}번째`);
      lyrics = await fetchLyricsMusixmatch(song, artist, 1); // 단일 시도로 호출
      if (lyrics) break;
      await new Promise(res => setTimeout(res, 1000));
    }
  }

  if (!lyrics) {
    return res.status(404).json({
      error: "LRCLIB과 Musixmatch API 모두에서 가사를 찾을 수 없습니다."
    });
  }

  // ─────────────────────────────────────────────
  // [추가] 타임스탬프가 포함된 가사 문자열을 파싱하여
  // 백엔드에는 타임스탬프와 텍스트를 분리한 로그를 남기고,
  // 프론트엔드에는 타임스탬프가 제거된 순수 가사 텍스트만 전달
  const pattern = /\[(\d{2}:\d{2}\.\d{2})\]\s*(.*)/;
  const lines = lyrics.split("\n");
  const result = [];
  for (let line of lines) {
    const match = line.match(pattern);
    if (match) {
      result.push({ time: match[1], text: match[2] });
    }
  }
  let plainLyrics;
  if (result.length > 0) {
    console.log("📝 [백엔드] 파싱된 가사:", result);
    // 프론트엔드에 보낼 때는 타임스탬프 없이 텍스트만 합칩니다.
    plainLyrics = result.map(item => item.text).join("\n");
  } else {
    plainLyrics = lyrics;
  }
  // ─────────────────────────────────────────────

  // 원본 가사는 백엔드 로그에 출력 (타임스탬프 포함)

  return res.json({ song, artist, album, duration, lyrics: plainLyrics, parsedLyrics: result.length > 0 ? result : null });
});

export default router;
