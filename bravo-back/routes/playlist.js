// routes/playlist.js
import express from 'express';
import { Playlist } from '../models/Playlist.js';
import { User } from '../models/User.js';

const router = express.Router();

// POST 요청을 통한 플레이리스트 그룹 생성
router.post('/', async (req, res) => {
  try {
    const { email, name, tracks } = req.body; // 변경: user_id 대신 email 사용
    if (!email || !name) {
      return res.status(400).json({ error: 'email과 name은 필수입니다.' });
    }
    // 새로운 플레이리스트 그룹 생성
    const newPlaylist = new Playlist({
      email,
      name,
      tracks, // Track.js의 일부 필드 배열
    });
    await newPlaylist.save();
    res.status(201).json(newPlaylist);
  } catch (error) {
    console.error('플레이리스트 그룹 생성 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

// 기존 GET 핸들러
router.get('/', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    // 기존에는 jwtToken 필드로 조회하고 있었으나, 이제 user_id 필드로 조회합니다.
    const playlists = await Playlist.find({ email: user_id });
    res.status(200).json(playlists);
  } catch (error) {
    console.error('Fetching playlists failed:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { tracksToAdd } = req.body;
    if (!tracksToAdd || !Array.isArray(tracksToAdd)) {
      return res.status(400).json({ error: 'tracksToAdd 배열이 필요합니다.' });
    }
    // 기존 플레이리스트에 새 트랙들을 맨 앞에 추가 (새로운 트랙들이 앞쪽에 오도록)
    const updatedPlaylist = await Playlist.findByIdAndUpdate(
      playlistId,
      { $push: { tracks: { $each: tracksToAdd, $position: 0 } } },
      { new: true }
    );
    if (!updatedPlaylist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    res.json(updatedPlaylist);
  } catch (error) {
    console.error('기존 플레이리스트 업데이트 실패:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;