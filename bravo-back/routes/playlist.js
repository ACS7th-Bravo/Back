// routes/playlist.js
import express from 'express';
import { Playlist } from '../models/Playlist.js';
import { User } from '../models/User.js';

const router = express.Router();

// POST 요청을 통한 플레이리스트 그룹 생성
router.post('/', async (req, res) => {
  try {
    const { user_id, name, tracks } = req.body;
    if (!user_id || !name) {
      return res.status(400).json({ error: 'user_id와 name은 필수입니다.' });
    }

    // [변경됨] 동일한 이름의 플레이리스트가 이미 존재하는지 확인
    const existingPlaylist = await Playlist.findOne({ email, name });
    if (existingPlaylist) {
      return res.status(400).json({ error: '이미 해당 이름의 플레이 리스트가 존재합니다.' });
    }

    // 새로운 플레이리스트 그룹 생성
    const newPlaylist = new Playlist({
      user_id,
      name,
      tracks, // 트랙 ID 배열
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