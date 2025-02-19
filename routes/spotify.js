// /bravo-back/routes/spotify.js (예시)

import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

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
    console.log("✅ Spotify access token fetched.");
    return accessToken;
  } else {
    throw new Error("❌ Failed to fetch Spotify access token");
  }
}

async function getAccessToken() {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    await fetchAccessToken();
  }
  return accessToken;
}

async function fetchSpotifyData(query, locale = null) {
  const token = await getAccessToken();
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    query
  )}&type=track&limit=20${locale ? `&locale=${locale}` : ""}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    console.error(`❌ Spotify API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.tracks.items || [];
}

/**
 * 병합에 사용할 함수를 작성:
 * - id, 이름, 아티스트, 앨범 id, 이미지 등은 한글 트랙 쪽이 우선
 * - 만약 영어 트랙 쪽에만 있으면 그 값 사용
 */
function mergeTrackData(kTrack, eTrack) {
  // kTrack 또는 eTrack이 null인 경우를 대비
  if (!kTrack && !eTrack) {
    return null; // 둘 다 없으면 생성 불가
  }
  if (!kTrack) {
    // 한글 결과 없으면 영어만
    return {
      id: eTrack.id,
      name: eTrack.name,
      artist: eTrack.artists.map((a) => a.name).join(", "),
      imageUrl: eTrack.album.images?.[0]?.url || null,
      album_id: eTrack.album?.id || null,
      artist_id: eTrack.artists?.[0]?.id || null,
      originalTrackName: eTrack.name,
      originalArtistName: eTrack.artists.map((a) => a.name).join(", "),
      englishTrackName: eTrack.name,
      englishArtistName: eTrack.artists.map((a) => a.name).join(", "),
    };
  }
  if (!eTrack) {
    // 영어 결과 없으면 한글만
    return {
      id: kTrack.id,
      name: kTrack.name,
      artist: kTrack.artists.map((a) => a.name).join(", "),
      imageUrl: kTrack.album.images?.[0]?.url || null,
      album_id: kTrack.album?.id || null,
      artist_id: kTrack.artists?.[0]?.id || null,
      originalTrackName: kTrack.name,
      originalArtistName: kTrack.artists.map((a) => a.name).join(", "),
      englishTrackName: null, // or kTrack.name
      englishArtistName: null, // or kTrack.artists...
    };
  }
  // 둘 다 있으면 병합
  return {
    id: kTrack.id,
    // 한글 쪽 정보 우선 사용 (원하시면 로직 조정)
    name: kTrack.name,
    artist: kTrack.artists.map((a) => a.name).join(", "),
    imageUrl: kTrack.album.images?.[0]?.url || null,
    album_id: kTrack.album?.id || null,
    artist_id: kTrack.artists?.[0]?.id || null,
    // 원본 (한글)
    originalTrackName: kTrack.name,
    originalArtistName: kTrack.artists.map((a) => a.name).join(", "),
    // 영어
    englishTrackName: eTrack.name,
    englishArtistName: eTrack.artists.map((a) => a.name).join(", "),
  };
}

// 🎯 Spotify 검색 API (한글 & 영어 데이터를 따로 가져옴)
router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res
      .status(400)
      .json({ error: "❌ Query parameter q is required" });
  }

  try {
    const koreanTracks = await fetchSpotifyData(query, "ko,en-US"); // 한글 우선
    const englishTracks = await fetchSpotifyData(query);           // 영어

    // 1) 영어 트랙을 ID 기준으로 저장
    const englishMap = new Map();
    for (const eTrack of englishTracks) {
      englishMap.set(eTrack.id, eTrack);
    }

    // 2) 먼저 "한국어 트랙"을 순회하며, 같은 ID가 있으면 병합
    const mergedResults = [];
    const usedEnglishIds = new Set(); // 추후 중복 방지
    for (const kTrack of koreanTracks) {
      const eTrack = englishMap.get(kTrack.id);
      if (eTrack) {
        mergedResults.push(mergeTrackData(kTrack, eTrack));
        usedEnglishIds.add(eTrack.id);
      } else {
        mergedResults.push(mergeTrackData(kTrack, null));
      }
    }

    // 3) "영어 트랙" 중에서 아직 사용되지 않은(한국어에 없는) 트랙을 추가
    for (const eTrack of englishTracks) {
      if (!usedEnglishIds.has(eTrack.id)) {
        mergedResults.push(mergeTrackData(null, eTrack));
      }
    }

    // 정렬을 원하는 방식대로 하거나, 그냥 그대로
    // 여기서는 간단히 mergedResults 배열 반환
    console.log("🔍 병합된 Spotify 검색 결과:", mergedResults);
    res.json(mergedResults);
  } catch (error) {
    console.error("❌ Error in /api/spotify/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
