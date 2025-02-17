import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const LRCLIB_API_BASE = process.env.LRCLIB_API_BASE || "http://localhost:3001";
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_API_HOST = process.env.MUSIXMATCH_API_HOST || "musixmatch-lyrics-songs.p.rapidapi.com";

/**
 * 곡명 정제 함수: 오른쪽 작은 따옴표 → 일반 따옴표, 괄호 및 그 뒤 내용 제거, 앞뒤 공백 제거
 */
function cleanTrackName(str) {
  return str.replace(/’/g, "'")
    .replace(/\s*\(.*$/, "")
    .trim();
}

/**
 * 아티스트명 정제 함수: 오른쪽 작은 따옴표 → 일반 따옴표, 쉼표 기준으로 분리 후 첫 번째 항목 반환, 앞뒤 공백 제거
 */
function cleanArtistName(str) {
  const cleaned = str.replace(/’/g, "'").trim();
  const parts = cleaned.split(",");
  return parts[0].trim();
}

/**
 * LRCLIB의 /api/get 엔드포인트를 단일 시도로 호출합니다.
 * 404나 '찾을 수 없음' 응답이면 바로 null 반환합니다.
 */
async function fetchLyricsLrcLib(song, artist, album = null, duration = null, retries = 1) {
  // cleanQueryString 대신 정제 함수 사용
  const cleanSong = cleanTrackName(song);
  const cleanArtist = cleanArtistName(artist);

  const queryParams = new URLSearchParams({
    track_name: cleanSong,
    artist_name: cleanArtist
  });
  if (album) queryParams.append("album_name", cleanTrackName(album));
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
  const cleanSong = cleanTrackName(song);
  const cleanArtist = cleanArtistName(artist);
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

  const { song, artist, album, duration, englishTrackName, englishArtistName } = req.query;
  // 영어 정보가 있으면 우선 사용하고, 그렇지 않으면 원문을 사용
  const trackNameToSearch = (englishTrackName && englishTrackName.trim() !== "") ? englishTrackName : song;
  const artistNameToSearch = (englishArtistName && englishArtistName.trim() !== "") ? englishArtistName : artist;

  if (!trackNameToSearch || !artistNameToSearch) {
    console.error("❌ [백엔드] 요청 실패: 곡명(song) 또는 아티스트명(artist) 누락");
    return res.status(400).json({ error: "곡명(song)과 아티스트명(artist)을 입력하세요." });
  }

  // 개별 정제 적용
  const cleanedTrackName = cleanTrackName(trackNameToSearch);
  const cleanedArtistName = cleanArtistName(artistNameToSearch);

  console.log("정제된 곡명:", cleanedTrackName);
  console.log("정제된 아티스트명:", cleanedArtistName);

  let lyrics = null;

  // LRCLIB API 2회 시도
  for (let i = 0; i < 2; i++) {
    console.log(`📡 [백엔드] LRCLIB API 시도 ${i + 1}번째`);
    lyrics = await fetchLyricsLrcLib(cleanedTrackName, cleanedArtistName, album, duration, 1);
    if (lyrics) break;
    // 시도 간 1초 대기
    await new Promise(res => setTimeout(res, 1000));
  }

  // LRCLIB에서 찾지 못하면 Musixmatch API 2회 시도
  if (!lyrics) {
    console.warn("⚠️ [백엔드] LRCLIB에서 가사를 찾지 못했습니다. Musixmatch API를 호출합니다.");
    for (let i = 0; i < 2; i++) {
      console.log(`📡 [백엔드] Musixmatch API 시도 ${i + 1}번째`);
      lyrics = await fetchLyricsMusixmatch(cleanedTrackName, cleanedArtistName, 1);
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
  // 프론트엔드에는 타임스탬프가 제거된 순수 가사와 파싱 결과(parsedLyrics)를 함께 전달합니다.
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
    // 프론트엔드에 보낼 때는 타임스탬프 없이 텍스트만 합칩니다.
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