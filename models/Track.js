//bravo-back/models/Track.js

import mongoose from 'mongoose';
const trackSchema = new mongoose.Schema({
    track_id: { type: String, required: true, unique: true },
    track_name: { type: String, required: true },
    artist_id: { type: String, required: true },
    artist_name: { type: String, required: true },
    album_id: { type: String, required: true },
    album_image: { type: String, required: true },
    plain_lyrics: { type: String }, // 원본 가사를 문자열로 저장 (선택사항)
    parsed_lyrics: { type: mongoose.Schema.Types.Mixed }, // 파싱된 가사 데이터를 자유롭게 저장 (예: 배열)
    lyrics_translation: { type: String }, // 번역된 가사 (선택사항)
    streaming_id: { type: String, required: true } // YouTube videoId 등
});
export const Track = mongoose.model('Track', trackSchema);