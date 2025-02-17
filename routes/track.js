// backend/routes/track.js
import express from 'express';
import { Track } from '../models/Track.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const {
      track_id,
      track_name,
      artist_id,
      artist_name,
      album_id,
      album_image,
      plain_lyrics,
      parsed_lyrics,
      lyrics_translation,
      streaming_id,
    } = req.body;

    // 만약 동일한 track_id가 이미 존재하면 저장하지 않거나 업데이트 처리할 수 있음.
    let track = await Track.findOne({ track_id });
    if (!track) {
      track = new Track({
        track_id,
        track_name,
        artist_id,
        artist_name,
        album_id,
        album_image,
        plain_lyrics,
        parsed_lyrics,
        lyrics_translation,
        streaming_id,
      });
      await track.save();
    }

    res.status(200).json({ message: 'Track saved successfully' });
  } catch (error) {
    console.error('Error saving track:', error);
    res.status(500).json({ message: 'Error saving track' });
  }
});

export default router;
