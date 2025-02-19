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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: true,
}));
app.use(express.json());
import spotifyRouter from './routes/spotify.js';
import youtubeRouter from './routes/youtube.js';
import googleRoutes from './routes/google.js';
// server.js 상단에 추가
import trackRoutes from './routes/track.js';


// 추가: Musixmatch 가사 라우터 등록
import lyricsRoutes from './routes/lyrics.js';

// 추가: 번역 전용 라우터 등록
import translateRoutes from './routes/translate.js';

// ... 기존 코드 위쪽 생략 ...
import playlistRouter from './routes/playlist.js';

app.use('/api/track', trackRoutes)
app.use("/api/spotify", spotifyRouter);
app.use("/api/youtube", youtubeRouter);
app.use('/api/google', googleRoutes);
app.use('/api/lyrics', lyricsRoutes);  // 원본 가사 엔드포인트
app.use('/api/translate', translateRoutes);  // 번역 전용 엔드포인트
// 기존 기타 라우터 등록 코드와 함께 추가
app.use('/api/playlist', playlistRouter);


// const flag = process.argv[2];

// if (flag === 'track') {
//   app.use('/api/track', trackRoutes)
//   app.use("/api/spotify", spotifyRouter);
//   app.use("/api/youtube", youtubeRouter);
//   app.use('/api/google', googleRoutes);
// } else {
//   app.use('/api/lyrics', lyricsRoutes);  // 원본 가사 엔드포인트
//   app.use('/api/translate', translateRoutes);  // 번역 전용 엔드포인트
//   // 기존 기타 라우터 등록 코드와 함께 추가
//   app.use('/api/playlist', playlistRouter);
// }


app.listen(PORT, '0.0.0.0', () => {
  console.log(`🥰 Server is running on port ${PORT}`);
});