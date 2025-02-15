// routes/playlist.js
import express from 'express';
import { Playlist } from '../models/playlist.js';
import { User } from '../models/User.js';

const router = express.Router();

// POST 요청을 통한 플레이리스트 그룹 생성
router.post('/', async (req, res) => {
  try {
    const { user_id, name, tracks } = req.body;
    if (!user_id || !name) {
      return res.status(400).json({ error: 'user_id와 name은 필수입니다.' });
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
    const playlists = await Playlist.find({ user_id });
    res.status(200).json(playlists);
  } catch (error) {
    console.error('Fetching playlists failed:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;