// /bravo-back/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
// import { createClient } from 'redis';

dotenv.config();

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/yourdbname";
// const REDIS_URI = process.env.REDIS_URI || "redis://192.168.56.100:6379";

// MongoDB 연결
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log("✅ MongoDB 연결 성공");
  })
  .catch((error) => {
    console.error("❌ MongoDB 연결 실패:", error);
  });

// // Redis 연결 (socket 옵션 사용)
// const redisClient = createClient({
//   socket: {
//     host: '192.168.2.137',
//     port: 6379,
//   }
// });

// redisClient.connect()
//   .then(() => {
//     console.log("✅ Redis 연결 성공");
//   })
//   .catch((error) => {
//     console.error("❌ Redis 연결 실패:", error);
//   });

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

// 추가: Musixmatch 가사 라우터 등록
import lyricsRoutes from './routes/lyrics.js';

// 추가: 번역 전용 라우터 등록
import translateRoutes from './routes/translate.js';

import playlistRouter from './routes/playlist.js';


app.use("/api/spotify", spotifyRouter);
app.use("/api/youtube", youtubeRouter);
app.use('/api/google', googleRoutes);
app.use('/api/lyrics', lyricsRoutes);  // 원본 가사 엔드포인트
app.use('/api/translate', translateRoutes);  // 번역 전용 엔드포인트
app.use('/api/playlist', playlistRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🥰 Server is running on port ${PORT}`);
});
