// /bravo-back/routes/lyrics.js
import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Track } from '../models/Track.js'; // 기존 Track 모델 사용

dotenv.config();

const router = express.Router();
const LRCLIB_API_BASE = process.env.LRCLIB_API_BASE || "https://lrclib.net";
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_API_HOST = process.env.MUSIXMATCH_API_HOST || "musixmatch-lyrics-songs.p.rapidapi.com";

function cleanQueryString(str) {
  return str.replace(/’/g, "'").trim();
}

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
 * (우리는 별도의 subtitles 엔드포인트를 사용하지 않습니다.)
 * 만약 API 응답이 리스트 형태(각 항목에 time 정보가 있는 경우)라면,
 * 각 항목을 "[mm:ss.xx] text" 형식의 문자열로 변환하여 반환합니다.
 */
async function fetchLyricsMusixmatch(song, artist, retries = 1) {
  const cleanSong = cleanQueryString(song);
  const cleanArtist = cleanQueryString(artist);
  console.log("test", cleanSong, cleanArtist)
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
    // 만약 API 응답이 리스트 형태라면 타임스탬프와 텍스트를 포맷합니다.
    if (Array.isArray(data) && data.length > 0) {
      const formatted = data.map(item => {
        const t = item.time || {};
        const minutes = t.minutes || 0;
        const seconds = t.seconds || 0;
        const hundredths = t.hundredths || 0;
        // "mm:ss.xx" 형식으로 생성
        const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
        return `[${formattedTime}] ${item.text || ""}`;
      }).join('\n');
      return formatted;
    }

    // 리스트 형태가 아니라면 기존 방식으로 처리
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
    lyrics = await fetchLyricsLrcLib(song, artist, album, duration, 1);
    if (lyrics) break;
    // 시도 간 1초 대기
    await new Promise(res => setTimeout(res, 1000));
  }

  // LRCLIB에서 찾지 못하면 Musixmatch API 2회 시도
  if (!lyrics) {
    console.warn("⚠️ [백엔드] LRCLIB에서 가사를 찾지 못했습니다. Musixmatch API를 호출합니다.");
    for (let i = 0; i < 2; i++) {
      console.log(`📡 [백엔드] Musixmatch API 시도 ${i + 1}번째`);
      lyrics = await fetchLyricsMusixmatch(song, artist, 1);
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
  // [추가] 타임스탬프가 포함된 가사 문자열을 파싱하여,
  // 백엔드 로그에는 타임스탬프와 텍스트 분리 결과를 남기고,
  // 프론트엔드에는 타임스탬프를 제거한 순수 가사와 파싱 결과(parsedLyrics)를 함께 전달합니다.
  if (typeof lyrics !== 'string') {
    console.error("❌ [백엔드] 가사 데이터 형식이 올바르지 않습니다:", lyrics);
    return res.status(500).json({
      error: "가사 데이터 처리 중 오류가 발생했습니다."
    });
  }
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
    // 프론트엔드에는 타임스탬프 없이 텍스트만 전달
    plainLyrics = result.map(item => item.text).join("\n");
  } else {
    plainLyrics = lyrics;
  }
  // ─────────────────────────────────────────────

  console.log("📝 [백엔드] 원본 가사:", lyrics);
  return res.json({
    song,
    artist,
    album,
    duration,
    lyrics: plainLyrics,
    parsedLyrics: result.length > 0 ? result : null
  });
});

export default router;