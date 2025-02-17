// /bravo-back/server.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/yourdbname";

// MongoDB 연결
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("✅ MongoDB 연결 성공");
}).catch((error) => {
  console.error("❌ MongoDB 연결 실패:", error);
});

const app = express();

app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: true,
}));
app.use(express.json());

import spotifyRouter from './routes/spotify.js';
import youtubeRouter from './routes/youtube.js';
import googleRoutes from './routes/google.js';
import lyricsRoutes from './routes/lyrics.js';
import translateRoutes from './routes/translate.js';
import playlistRouter from './routes/playlist.js';

// 새로 추가할 Track 라우터 import
import trackRouter from './routes/track.js';

app.use("/api/spotify", spotifyRouter);
app.use("/api/youtube", youtubeRouter);
app.use('/api/google', googleRoutes);
app.use('/api/lyrics', lyricsRoutes);  // 원본 가사 엔드포인트
app.use('/api/translate', translateRoutes);  // 번역 전용 엔드포인트
app.use('/api/playlist', playlistRouter);

// Track 정보 저장 라우터 등록
app.use('/api/track', trackRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🥰 Server is running on port ${PORT}`);
});
