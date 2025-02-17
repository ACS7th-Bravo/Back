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
