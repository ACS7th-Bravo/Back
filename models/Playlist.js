// bravo-back/models/Playlist.js
import mongoose from 'mongoose';
// Track의 일부 필드만 포함하는 서브 스키마 정의
const trackSubSchema = new mongoose.Schema({
  track_id: {
    type: String,
    required: true,
    description: "트랙의 고유 아이디 - 필수"
  },
  track_name: {
    type: String,
    required: true,
    description: "트랙 이름 - 필수"
  },
  artist_id: {
    type: String,
    required: true,
    description: "아티스트 아이디 - 필수"
  },
  artist_name: {
    type: String,
    required: true,
    description: "아티스트 이름 - 필수"
  },
  album_id: {
    type: String,
    required: true,
    description: "앨범 아이디 - 필수"
  },
  album_image: {
    type: String,
    required: true,
    description: "앨범 이미지 URL - 필수"
  }
}, { _id: false }); // 별도의 _id 생성 방지
const playlistSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    match: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    description: "유효한 이메일 주소 - 필수"
  },
  name: {
    type: String,
    required: true,
    description: "플레이리스트 이름 - 필수"
  },
  // tracks 배열 안에 Track.js의 일부 필드만 포함하는 서브 도큐먼트
  tracks: {
    type: [trackSubSchema],
    description: "Track.js의 일부 필드 (track_id, track_name, artist_id, artist_name, album_id, album_image) 참조"
  }
}, { timestamps: true });
export const Playlist = mongoose.model('Playlist', playlistSchema);