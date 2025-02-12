// bravo-back/routes/translate.js


import express from 'express';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function translateLyrics(lyrics) {
  const systemPrompt = `
    Purpose:
    Convert into Korean while preserving its original structure, tone, and meaning. Ensure that every line is accurately rewritten in Korean without adding any extra information or explanations.
    System Instructions
    Convert into Korean line by line, keeping the original format intact.
    Preserve the artistic, literary, and poetic essence.
    Do not add introductions, explanations, disclaimers, or any extra messages before or after the output.
    Ensure all lines are in the same tone and style without mixing informal and formal speech.
    Ensure that all lines are fully translated without omission or modification.
  `;
  const inputPayload = {
    modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        { role: "user", content: `${systemPrompt}\n\n${lyrics}` }
      ],
      max_tokens: 4096,
      temperature: 1.0
    })
  };
  try {
    const command = new InvokeModelCommand(inputPayload);
    const response = await client.send(command);
    const responseBody = new TextDecoder("utf-8").decode(response.body);
    const responseData = JSON.parse(responseBody);
    
    // 기존 방식: completion 또는 outputs[0]?.content
    let translatedText = responseData.completion || (responseData.outputs && responseData.outputs[0]?.content);
    
    // 새 방식: content 필드가 배열로 주어지는 경우 처리 (각 항목의 text를 합침)
    if (!translatedText && Array.isArray(responseData.content)) {
      translatedText = responseData.content.map(item => item.text).join("");
    }
    
    if (translatedText) {
      console.log(":메모: 번역 결과:\n", translatedText);
      return translatedText;
    } else {
      console.error(":x: 응답에서 번역 결과를 찾을 수 없습니다.", responseData);
      return null;
    }
  } catch (error) {
    console.error(":x: 번역 요청 실패:", error);
    return null;
  }
}

router.post('/', async (req, res) => {
  const { lyrics } = req.body;
  if (!lyrics) {
    return res.status(400).json({ error: "가사(lyrics)를 제공하세요." });
  }
  const translated = await translateLyrics(lyrics);
  if (!translated) {
    return res.status(500).json({ error: "번역에 실패했습니다." });
  }
  res.json({ translatedLyrics: translated });
});

export default router;
