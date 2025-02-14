import mongoose from 'mongoose';

const trackSchema = new mongoose.Schema({
    track_id: { type: String, required: true, unique: true },
    artist_id: { type: String, required: true },
    album_id: { type: String, required: true },
    lyrics: { type: String },
    lyrics_translation: { type: String },
    streaming_id: { type: String, required: true }
});

export const Track = mongoose.model('Track', trackSchema);