import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  picture: { type: String },
  jwtToken: { type: String }, // JWT 토큰 저장용 필드
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', userSchema);