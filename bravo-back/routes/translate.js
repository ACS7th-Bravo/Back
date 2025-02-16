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
 * AWS Translate를 이용해 가사를 한국어로 번역합니다.
 * (Papago 대신 Amazon Translate 사용)
 * @param {string} originalLyrics - 원문 가사
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

    // 만약 감지된 원본 언어가 한국어라면 번역을 건너뜁니다.
    if (response.SourceLanguageCode && response.SourceLanguageCode === "ko") {
      console.log("감지된 원본 언어가 한국어입니다. 번역을 건너뜁니다.");
      return originalLyrics;
    }

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
 * Claude 3.5 Sonnet을 이용해 번역 품질 개선 (한국어 → 한국어 품질 개선)
 * (여기서는 Amazon Translate 결과를 기반으로 보정)
 */
async function refineTranslation(amazonTranslation) {
  console.log("🔄 Claude 3.5 Sonnet에서 번역 품질 개선 진행 중...");
  const startTime = performance.now();
  if (!amazonTranslation || amazonTranslation.trim().length === 0) {
    console.error("❌ Amazon Translate 결과가 없습니다. Claude에게 원문을 전달하지 않습니다.");
    return null;
  }
  const systemPrompt = `
This request is for academic and personal study purposes only.
Please polish the following Korean text for better fluency and natural tone while preserving its intended meaning, rhythm, and style.
Note: Do not reproduce or include any substantial portions of copyrighted original text.
: **Important Instructions:**
- Do NOT summarize, combine, or omit any lines.
- **Process each line individually:** The output must have exactly one refined line for each input line.
- Do not merge two or more lines.
- The final output must contain ONLY the polished Korean text, with no introductory phrases, headers, or extra commentary.
- Do NOT include any headers, labels, or additional commentary in the output.
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
      stop_sequences: ["copyright"]
    })
  };
  try {
    const command = new InvokeModelCommand(inputPayload);
    const response = await client.send(command);
    const responseBody = new TextDecoder("utf-8").decode(response.body);
    const responseData = JSON.parse(responseBody);
    let refinedLyrics = responseData?.content?.[0]?.text?.trim();
    if (!refinedLyrics) {
      console.error("❌ Claude 3.5 응답에서 번역 결과를 찾을 수 없습니다.");
      return null;
    }
    const outputTokens = encode(refinedLyrics);
    console.log(`🔢 Claude 출력 토큰 수: ${outputTokens.length}`);
    console.log(`🔢 총 토큰 수 (입력 + 출력): ${inputTokens.length + outputTokens.length}`);
    const endTime = performance.now();
    console.log(`📝 최종 번역 결과 (소요 시간: ${(endTime - startTime).toFixed(2)}ms)`);

    // 후처리: 대괄호로 시작하는 헤더 제거
    refinedLyrics = refinedLyrics.replace(/^\[.*?\]\s*/, '').trimStart();
    // 후처리: "Here is" 로 시작하는 문장 제거 (대소문자 무시)
    refinedLyrics = refinedLyrics.replace(/^Here is.*\n?/i, '').trim();

    console.log(refinedLyrics);
    return refinedLyrics;
  } catch (error) {
    console.error("❌ Claude 3.5 번역 보정 요청 실패:", error);
    return null;
  }
}

/**
 * 전체 번역 프로세스 실행 함수
 * 순서:
 * 1) 한글 비율 검사 → (대체로 한국어면) 원문 반환
 * 2) Amazon Translate 실행
 * 3) Claude 보정 시도 → 거부 메시지나 파싱 불일치시 fallback 처리
 */
async function processTranslation(lyrics) {
  console.log("🚀 전체 번역 프로세스 시작");

  // 1. 한글 비율 계산 및 디버그 로그
  const lettersOnly = lyrics.replace(/[^a-zA-Z가-힣]/g, '');
  const koreanMatches = lettersOnly.match(/[가-힣]/g) || [];
  const koreanCount = koreanMatches.length;
  const totalCount = lettersOnly.length;
  const ratio = totalCount ? (koreanCount / totalCount) : 0;
  console.log(`한글 비율: ${ratio.toFixed(2)} (koreanCount=${koreanCount}, totalCount=${totalCount})`);

  // 임계값을 50%로 설정 (필요에 따라 조정 가능)
  if (isMostlyKorean(lyrics, 0.5)) {
    console.log("입력 텍스트는 대체로 한국어입니다. 번역 프로세스를 건너뜁니다.");
    return lyrics;
  }

  const totalStartTime = performance.now();

  // 2. Amazon Translate 실행 (원문 → 한국어)
  const amazonResult = await translateWithAmazon(lyrics);
  if (!amazonResult || amazonResult.trim().length === 0 || amazonResult.trim() === "...") {
    console.error("❌ Amazon Translate 실패: Claude에게 원문을 전달하지 않습니다.");
    return null;
  }
  // 3. Claude 3.5 Sonnet을 이용한 번역 보정 실행 (한국어 → 한국어 품질 개선)
  let refinedResult = await refineTranslation(lyrics, amazonResult);

  // fallback: Claude 거부 메시지 감지 → Amazon 결과 사용
  if (
    !refinedResult ||
    refinedResult.includes("I apologize, but I cannot assist") ||
    refinedResult.includes("cannot help with copyrighted lyrics")
  ) {
    console.log("⚠️ Claude 거부(사과) 메시지 감지 → Amazon Translate 결과만 사용");
    refinedResult = amazonResult;
  }

  // 추가 fallback: 줄 수가 현저히 다르면 Amazon 결과 사용 (예: refined 결과 줄 수가 Amazon의 50% 미만)
  const refinedLines = refinedResult.split('\n').filter(line => line.trim() !== '');
  const amazonLines = amazonResult.split('\n').filter(line => line.trim() !== '');
  if (refinedLines.length < amazonLines.length * 0.5) {
    console.log("⚠️ 보정된 결과의 줄 수가 현저히 부족합니다. Amazon Translate 결과로 fallback합니다.");
    refinedResult = amazonResult;
  }

  const totalEndTime = performance.now();
  console.log(`🚀 전체 번역 프로세스 완료 (총 소요 시간: ${(totalEndTime - totalStartTime).toFixed(2)}ms)`);
  return refinedResult;
}

router.post('/', async (req, res) => { // 번역 요청 처리
  const { lyrics } = req.body;
  if (!lyrics) {
    res.status(400).json({ error: "원문 가사를 제공하세요." });
    return;
  }

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  try {
    // 1. 공백, 구두점, 숫자, 기호 제거 후 한글 비율 계산
    const lettersOnly = lyrics.replace(/[^a-zA-Z가-힣]/g, '');
    const koreanMatches = lettersOnly.match(/[가-힣]/g) || [];
    const koreanCount = koreanMatches.length;
    const totalCount = lettersOnly.length;
    const ratio = totalCount ? (koreanCount / totalCount) : 0;
    console.log(`한글 비율: ${ratio.toFixed(2)} (koreanCount=${koreanCount}, totalCount=${totalCount})`);

    if (ratio >= 0.5) {
      console.log("대부분 한국어이므로 번역 건너뜀");
      res.write(`data: ${JSON.stringify({ stage: 'refined', translation: lyrics })}\n\n`);
      res.end();
      return;
    }

    // 2. Amazon Translate 실행 및 결과 전송
    const amazonResult = await translateWithAmazon(lyrics);
    if (!amazonResult) {
      res.write(`data: ${JSON.stringify({ stage: 'error', message: 'Amazon Translate 실패' })}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ stage: 'amazon', translation: amazonResult })}\n\n`);

    // Amazon Translate 결과가 클라이언트에 표시되도록 2초 대기
    await new Promise(resolve => setTimeout(resolve, 2000));

    // "번역 보정 진행중..." 메시지 전송
    res.write(`data: ${JSON.stringify({ stage: 'update', translation: '번역 보정 진행중...' })}\n\n`);

    // 3. AI 번역(최종 번역) 진행 및 결과 전송
    let refinedResult = await refineTranslation(lyrics, amazonResult);

    // Claude가 거부하면 fallback
    if (
      !refinedResult ||
      refinedResult.includes("I apologize, but I cannot assist") ||
      refinedResult.includes("cannot help with copyrighted lyrics")
    ) {
      console.log("⚠️ Claude 거부(사과) 메시지 감지 → Amazon 번역만 사용");
      refinedResult = amazonResult;
    }

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