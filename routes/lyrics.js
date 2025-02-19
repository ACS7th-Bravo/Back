// /bravo-back/routes/lyrics.js

import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Track } from '../models/Track.js'; // Track 모델 임포트 추가

dotenv.config();

const router = express.Router();
const LRCLIB_API_BASE = process.env.LRCLIB_API_BASE || "http://localhost:3001";
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_API_HOST = process.env.MUSIXMATCH_API_HOST || "musixmatch-lyrics-songs.p.rapidapi.com";

/**
 * 문자열 정리 함수 (필요시 확장 가능)
 */
function cleanQueryString(str) {
  return str
    .replace(/’/g, "'")          // 오른쪽 작은 따옴표를 일반 따옴표로 변환
    .replace(/\s*\(.*$/, "")     // 공백과 '(' 이후의 모든 문자 제거
    .trim();                     // 앞뒤 공백 제거
}

/**
 * 곡명 정제 함수: 오른쪽 작은 따옴표 → 일반 따옴표, 괄호 및 그 뒤 내용 제거, 앞뒤 공백 제거
 */
function cleanTrackName(str) {
  return str
    .replace(/’/g, "'")
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
  const cleanSong = cleanTrackName(song);
  const cleanArtist = cleanArtistName(artist);

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
    console.error("❌ [백엔드] LRCLIB API 호출 중 오류 발생:", error);
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
    if (Array.isArray(data) && data.length > 0) {
      const formatted = data.map(item => {
        const t = item.time || {};
        const minutes = t.minutes || 0;
        const seconds = t.seconds || 0;
        const hundredths = t.hundredths || 0;
        const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
        return `[${formattedTime}] ${item.text || ""}`;
      }).join('\n');
      return formatted;
    }

    const lyrics = data.message?.body?.lyrics?.lyrics_body;
    if (lyrics) {
      return lyrics;
    }
  } catch (error) {
    console.error("❌ [백엔드] Musixmatch API 호출 중 오류 발생:", error);
  }
  return null;
}

/**
 * 가사 문자열을 파싱하여 시간 정보가 있는 경우 구조화된 형태로 반환
 * @param {string} lyrics - 원본 가사 문자열
 * @returns {Array|null} - 파싱된 가사 배열 또는 null
 */
function parseLyrics(lyrics) {
  if (!lyrics) return null;
  
  const timeStampRegex = /\[(\d{2}):(\d{2})\.(\d{2})\]/;
  const lines = lyrics.split('\n');
  const parsedLines = [];
  
  for (const line of lines) {
    const match = line.match(timeStampRegex);
    if (match) {
      const [, minutes, seconds, hundredths] = match;
      const time = `${minutes}:${seconds}.${hundredths}`;
      const text = line.replace(timeStampRegex, '').trim();
      parsedLines.push({
        time,
        text
      });
    }
  }
  return parsedLines.length > 0 ? parsedLines : null;
}

/**
 * 가사 검증 함수
 * @param {string} lyrics - 검증할 가사
 * @param {string} trackName - 트랙 이름
 * @param {string} artistName - 아티스트 이름
 * @returns {boolean} - 검증 통과 여부
 */
function validateLyrics(lyrics, trackName, artistName) {
  if (!lyrics || typeof lyrics !== 'string') return false;
  
  const hasValidFormat = lyrics.includes('[') && lyrics.includes(']');
  if (!hasValidFormat) return false;

  const classicalKeywords = ['symphony', 'concerto', 'sonata', 'opus', 'preludes', 'étude', 'nocturne'];
  const classicalComposers = ['mozart', 'beethoven', 'bach', 'chopin', 'liszt', 'debussy', 'tchaikovsky'];
  
  const isClassical = classicalKeywords.some(keyword => 
    trackName.toLowerCase().includes(keyword)
  ) || classicalComposers.some(composer => 
    artistName.toLowerCase().includes(composer)
  );
  if (isClassical) return false;

  const minLength = 50;
  const maxLength = 10000;
  if (lyrics.length < minLength || lyrics.length > maxLength) return false;

  const timestampCount = (lyrics.match(/\[\d{2}:\d{2}\.\d{2}\]/g) || []).length;
  if (timestampCount < 5) return false;

  return true;
}

/**
 * 문자열에서 [00:00.00] 같은 타임스탬프를 제거해주는 함수
 */
function removeTimestamps(lyrics) {
  if (!lyrics) return lyrics;
  return lyrics.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();
}

router.get('/', async (req, res) => {
  const { track_id, song, artist, album, duration, englishTrackName, englishArtistName } = req.query;
  const trackNameToSearch = englishTrackName || song;
  const artistNameToSearch = englishArtistName || artist;

  console.log(`🎵 가사 검색 시작: ${trackNameToSearch} - ${artistNameToSearch}`);

  // 1. DB에서 먼저 확인
  if (track_id) {
    try {
      const trackDoc = await Track.findOne({ track_id });
      if (trackDoc?.plain_lyrics) {
        console.log("✅ DB에서 가사를 불러왔습니다.");
        return res.json({
          song,
          artist,
          album,
          duration,
          lyrics: trackDoc.plain_lyrics,
          parsedLyrics: trackDoc.parsed_lyrics
        });
      }
    } catch (err) {
      console.error("❌ DB 조회 오류:", err);
    }
  }

  // 2. API에서 가사 가져오기
  let lyrics = await fetchLyricsLrcLib(trackNameToSearch, artistNameToSearch, album, duration);
  if (!lyrics) {
    lyrics = await fetchLyricsMusixmatch(trackNameToSearch, artistNameToSearch);
  }

  // 3. 가사 검증
  if (lyrics && !validateLyrics(lyrics, trackNameToSearch, artistNameToSearch)) {
    console.warn("⚠️ 가사 검증 실패: 부적절한 가사가 감지되었습니다");
    lyrics = null;
  }

  // 4. 가사를 찾지 못했거나 검증에 실패한 경우
  if (!lyrics) {
    console.log("⚠️ 가사를 찾지 못했으나, 노래 재생은 계속합니다. 빈 가사를 반환합니다.");
    return res.json({
      song,
      artist,
      album,
      duration,
      lyrics: "",          // 빈 문자열로 대체
      parsedLyrics: []     // 파싱된 가사 배열은 빈 배열로 대체
    });
  }

  // 5. 검증된 가사를 DB에 저장
  if (track_id) {
    try {
      const parsedLyrics = parseLyrics(lyrics);
      const plainWithoutTimestamps = removeTimestamps(lyrics);

      await Track.findOneAndUpdate(
        { track_id },
        { 
          plain_lyrics: plainWithoutTimestamps,
          parsed_lyrics: parsedLyrics
        },
        { upsert: true }
      );
      console.log("✅ DB에 가사 저장 완료");
    } catch (err) {
      console.error("❌ DB 저장 오류:", err);
    }
  }

  // 6. 응답 반환
  return res.json({
    song,
    artist,
    album,
    duration,
    lyrics: removeTimestamps(lyrics),
    parsedLyrics: parseLyrics(lyrics)
  });
});

export default router;
