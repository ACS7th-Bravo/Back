// Playlist.js
// import mongoose from 'mongoose';

// // 새로운 서브 스키마: 각 트랙의 세부 정보를 보관합니다.
// const trackSchema = new mongoose.Schema({
//   trackId: { type: String, required: true },
//   title: { type: String, required: true },
//   artist: { type: String, required: true },
//   albumImage: { type: String }
// });

// // Playlist 스키마 수정: tracks 필드를 trackSchema 배열로 정의
// const playlistSchema = new mongoose.Schema({
//   user_id: { type: String, required: true },
//   name: { type: String, required: true },
//   tracks: { type: [trackSchema], default: [] }
// }, {
//   timestamps: true
// });

// export const Playlist = mongoose.model('Playlist', playlistSchema);
import mongoose from 'mongoose';
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
    tracks: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Track',
        description: "Track.js 참조"
    }
}, { timestamps: true });
export const Playlist = mongoose.model('Playlist', playlistSchema);