import express from 'express';
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { performance } from "perf_hooks";
import dotenv from "dotenv";
import { encode } from "gpt-3-encoder"; // 토큰 수 계산 라이브러리

dotenv.config();

const router = express.Router();

// AWS Bedrock Client 설정 (region은 env에 있는 값 그대로 사용)
const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// AWS Translate Client 생성
const translateClient = new TranslateClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 한글 포함 여부 확인 함수
function containsKorean(text) {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text);
}

/**
 * AWS Translate를 이용해 영어 가사를 한국어로 번역합니다.
 * (Papago 대신 Amazon Translate 사용)
 * @param {string} originalLyrics - 원문 영어 가사
 * @returns {Promise<string|null>} - 번역된 한국어 텍스트 또는 null
 */
async function translateWithAmazon(originalLyrics) {
  console.log("🔄 Amazon Translate를 사용하여 1차 번역 진행 중...");
  const startTime = performance.now();
  try {
    const command = new TranslateTextCommand({
      SourceLanguageCode: "auto", // 원문 언어 자동 감지
      TargetLanguageCode: "ko",   // 대상 언어 (한국어)
      Text: originalLyrics,
    });
    const response = await translateClient.send(command);
    const translatedText = response.TranslatedText;
    // 번역 결과에 한글이 포함되어 있지 않으면 무시
    if (!translatedText || !containsKorean(translatedText)) {
      console.error("❌ Amazon Translate 결과에 한글이 포함되어 있지 않습니다.");
      return null;
    }
    // 토큰 수 계산 (디버그용)
    const inputTokens = encode(originalLyrics);
    const outputTokens = encode(translatedText);
    console.log(`🔢 Amazon Translate 입력 토큰 수: ${inputTokens.length}`);
    console.log(`🔢 Amazon Translate 출력 토큰 수: ${outputTokens.length}`);
    const endTime = performance.now();
    console.log(`✅ Amazon Translate 번역 성공 (소요 시간: ${(endTime - startTime).toFixed(2)}ms)`);
    console.log("✅ Amazon Translate 결과 (한국어):");
    console.log(translatedText);
    return translatedText;
  } catch (error) {
    console.error("❌ Amazon Translate 중 오류 발생:", error);
    return null;
  }
}

/**
 * :흰색_확인_표시: Claude 3.5 Sonnet을 이용해 번역 품질 개선 (한국어 → 한국어 품질 개선)
 * - 시스템 프롬프트에 emoji와 추가 형식을 적용하여 최종 결과가 오직 보정된 한국어 가사만 포함되도록 합니다.
 * (여기서는 Papago 번역 결과 대신 Amazon Translate 결과를 사용합니다.)
 */
async function refineTranslation(originalLyrics, amazonTranslation) {
  console.log("🔄 Claude 3.5 Sonnet에서 번역 품질 개선 진행 중...");
  const startTime = performance.now();
  if (!amazonTranslation || amazonTranslation.trim().length === 0) {
    console.error("❌ Amazon Translate 결과가 없습니다. Claude에게 원문을 전달하지 않습니다.");
    return null;
  }
  const systemPrompt = `
This request is for academic and personal study purposes only.
Please polish the following Korean text for better fluency and natural tone while preserving its intended meaning, rhythm, and style.
Note: Do not reproduce or include any substantial portions of copyrighted original lyrics.
: **Important Instructions:**
- Do NOT summarize, combine, or omit any lines.
- **Process each line individually:** The output must have exactly one refined line for each input line.
- Do not merge two or more lines.
- The final output should consist solely of the improved Korean text.
- Do NOT add any extra commentary or explanations.
: **Input:**
[Initial Korean Translation]
${amazonTranslation}
: **Output:**
`;
  const inputTokens = encode(systemPrompt);
  console.log(`🔢 Claude 입력 토큰 수: ${inputTokens.length}`);
  const inputPayload = {
    modelId: process.env.INFERENCE_PROFILE_ARN,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [{ role: "user", content: systemPrompt }],
      max_tokens: 10000,
      temperature: 0.9,
      top_p: 0.8,
      top_k: 250,
      stop_sequences: ["Polished"]
    })
  };
  try {
    const command = new InvokeModelCommand(inputPayload);
    const response = await client.send(command);
    const responseBody = new TextDecoder("utf-8").decode(response.body);
    const responseData = JSON.parse(responseBody);
    const refinedLyrics = responseData?.content?.[0]?.text?.trim();
    if (!refinedLyrics) {
      console.error("❌ Claude 3.5 응답에서 번역 결과를 찾을 수 없습니다.");
      return null;
    }
    const outputTokens = encode(refinedLyrics);
    console.log(`🔢 Claude 출력 토큰 수: ${outputTokens.length}`);
    console.log(`🔢 총 토큰 수 (입력 + 출력): ${inputTokens.length + outputTokens.length}`);
    const endTime = performance.now();
    console.log(`📝 최종 번역 결과 (소요 시간: ${(endTime - startTime).toFixed(2)}ms)`);
    console.log(refinedLyrics);
    return refinedLyrics;
  } catch (error) {
    console.error("❌ Claude 3.5 번역 보정 요청 실패:", error);
    return null;
  }
}

/**
 * 전체 번역 프로세스 실행 함수
 * 순서: Papago 기계번역 → Claude 번역 보정
 * (이제 Papago 대신 Amazon Translate를 사용)
 * @param {string} lyrics - 원문 영문 가사
 * @returns {Promise<string|null>} - 최종 번역 결과 또는 null
 */
async function processTranslation(lyrics) {
  console.log("🚀 전체 번역 프로세스 시작");
  const totalStartTime = performance.now();
  // 1. Amazon Translate 실행 (영어 → 한국어)
  const amazonResult = await translateWithAmazon(lyrics);
  if (!amazonResult || amazonResult.trim().length === 0 || amazonResult.trim() === "...") {
    console.error("❌ Amazon Translate 실패: Claude에게 원문을 전달하지 않습니다.");
    return null;
  }
  // 2. Claude 3.5 Sonnet을 이용한 번역 보정 실행 (한국어 → 한국어 품질 개선)
  const refinedResult = await refineTranslation(lyrics, amazonResult);
  const totalEndTime = performance.now();
  console.log(`🚀 전체 번역 프로세스 완료 (총 소요 시간: ${(totalEndTime - totalStartTime).toFixed(2)}ms)`);
  return refinedResult;
}

router.post('/', async (req, res) => { // 번역 요청 처리
  const { lyrics } = req.body;
  if (!lyrics) {
    res.status(400).json({ error: "영문 가사를 제공하세요." });
    return;
  }

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  try {
    // 1. Amazon Translate 실행 및 결과 전송
    const amazonResult = await translateWithAmazon(lyrics);
    if (!amazonResult) {
      res.write(`data: ${JSON.stringify({ stage: 'error', message: 'Amazon Translate 실패' })}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ stage: 'amazon', translation: amazonResult })}\n\n`);

    // Amazon Translate 결과가 클라이언트에 표시되도록 2초 대기
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. "번역 보정 진행중..." 메시지 전송
    res.write(`data: ${JSON.stringify({ stage: 'update', translation: '번역 보정 진행중...' })}\n\n`);

    // 3. AI 번역(최종 번역) 진행 및 결과 전송
    const refinedResult = await refineTranslation(lyrics, amazonResult);
    if (!refinedResult) {
      res.write(`data: ${JSON.stringify({ stage: 'error', message: 'AI 번역 실패' })}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ stage: 'refined', translation: refinedResult })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ stage: 'error', message: '번역 프로세스에 실패했습니다.' })}\n\n`);
    res.end();
  }
});

export default router;