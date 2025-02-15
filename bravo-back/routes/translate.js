import express from 'express';
import puppeteer from 'puppeteer';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { performance } from "perf_hooks";
import dotenv from "dotenv";
import { encode } from "gpt-3-encoder";

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

// 한글 포함 여부 확인 함수
function containsKorean(text) {
  return /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text);
}

/**
 * :흰색_확인_표시: Papago 번역 실행 (입력 자동 감지 → 한국어)
 * - Papago URL에 sk=auto, tk=ko 파라미터를 추가하여 대상 언어를 한국어로 강제합니다.
 * - 번역 결과에 한글이 하나도 포함되지 않으면 null을 반환합니다.
 */
async function translateWithPapago(originalLyrics) {
  console.log(":시계_반대_방향_화살표: Papago에서 1차 번역 진행 중...");
  const startTime = performance.now();
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Papago URL: 입력은 자동 감지, 출력은 한국어로 설정
    await page.goto('https://papago.naver.com/?sk=auto&tk=ko', { waitUntil: 'networkidle2' });
    const inputSelector = 'textarea#txtSource';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    // 원문 입력
    await page.evaluate((selector, text) => {
      const inputBox = document.querySelector(selector);
      inputBox.value = '';
      inputBox.value = text;
      inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    }, inputSelector, originalLyrics);
    await page.keyboard.press('Enter');
    const resultSelector = 'div#txtTarget';
    // 번역 결과가 나타날 때까지 대기 (최대 15초)
    await page.waitForFunction(
      selector => {
        const el = document.querySelector(selector);
        return el && el.innerText.trim().length > 0 && el.innerText.trim() !== "...";
      },
      { timeout: 15000 },
      resultSelector
    );
    let translatedText = await page.evaluate(selector => {
      const element = document.querySelector(selector);
      return element ? element.innerText.trim() : null;
    }, resultSelector);
    // 번역 실패 시 재시도
    if (!translatedText || translatedText.trim() === "..." || translatedText.trim().length < 5) {
      console.error(":x: Papago 번역 실패: 번역이 정상적으로 수행되지 않았습니다. 재시도 중...");
      await browser.close();
      return await translateWithPapago(originalLyrics);
    }
    // 번역 결과에 한글이 전혀 없으면 결과 무시 후 null 반환
    if (!containsKorean(translatedText)) {
      console.error(":x: Papago 번역 결과에 한글이 전혀 포함되어 있지 않습니다. 번역 결과를 무시합니다.");
      await browser.close();
      return null;
    }
    // 토큰 수 계산 (디버그용)
    const inputTokens = encode(originalLyrics);
    const outputTokens = encode(translatedText);
    console.log(`:1234: Papago 입력 토큰 수: ${inputTokens.length}`);
    console.log(`:1234: Papago 출력 토큰 수: ${outputTokens.length}`);
    const endTime = performance.now();
    console.log(`:흰색_확인_표시: Papago 번역 성공 (소요 시간: ${(endTime - startTime).toFixed(2)}ms)`);
    console.log(":흰색_확인_표시: Papago 번역 결과 (한국어):");
    console.log(translatedText);
    return translatedText;
  } catch (error) {
    console.error(":x: Papago 번역 중 오류 발생:", error);
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * :흰색_확인_표시: Claude 3.5 Sonnet을 이용해 번역 품질 개선 (한국어 → 한국어 품질 개선)
 * - 시스템 프롬프트에 emoji와 추가 형식을 적용하여 최종 결과가 오직 보정된 한국어 가사만 포함되도록 합니다.
 */
async function refineTranslation(originalLyrics, papagoTranslation) {
  console.log(":시계_반대_방향_화살표: Claude 3.5 Sonnet에서 번역 품질 개선 진행 중...");
  const startTime = performance.now();
  if (!papagoTranslation || papagoTranslation.trim().length === 0) {
    console.error(":x: Papago 번역 실패: Claude에게 원문을 전달하지 않습니다.");
    return null;
  }
  const systemPrompt = `
Please refine the given Korean lyrics for better fluency and natural tone while preserving the original meaning and style.
: **Important Instructions:**
- Do NOT summarize, combine, or omit any lines.
- **Process each line individually:** The output must have exactly one refined line for each input line. Do not merge two or more lines.
- Maintain the original rhythm and structure as closely as possible.
- Ensure the final output consists ONLY of the refined Korean lyrics (no additional commentary, headers, or merged lines).
- Do NOT add any extra commentary or explanations.
: **Input:**
[Original English Lyrics]
${originalLyrics}
[Initial Korean Translation]
${papagoTranslation}
: **Output:**
Refined Korean Lyrics:
`;
  const inputTokens = encode(systemPrompt);
  console.log(`:1234: Claude 입력 토큰 수: ${inputTokens.length}`);
  const inputPayload = {
    modelId: process.env.INFERENCE_PROFILE_ARN,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [{ role: "user", content: systemPrompt }],
      max_tokens: 2048,
      temperature: 0.9,
      top_p: 0.8,
      top_k: 250,
      stop_sequences: ["Korean Translation:"]
    })
  };
  try {
    const command = new InvokeModelCommand(inputPayload);
    const response = await client.send(command);
    const responseBody = new TextDecoder("utf-8").decode(response.body);
    const responseData = JSON.parse(responseBody);
    const refinedLyrics = responseData?.content?.[0]?.text?.trim();
    if (!refinedLyrics) {
      console.error(":x: Claude 3.5 응답에서 번역 결과를 찾을 수 없습니다.");
      return null;
    }
    const outputTokens = encode(refinedLyrics);
    console.log(`:1234: Claude 출력 토큰 수: ${outputTokens.length}`);
    console.log(`:1234: 총 토큰 수 (입력 + 출력): ${inputTokens.length + outputTokens.length}`);
    const endTime = performance.now();
    console.log(`:메모: 최종 번역 결과 (소요 시간: ${(endTime - startTime).toFixed(2)}ms)`);
    console.log(refinedLyrics);
    return refinedLyrics;
  } catch (error) {
    console.error(":x: Claude 3.5 번역 보정 요청 실패:", error);
    return null;
  }
}

/**
 * 전체 번역 프로세스 실행 함수
 * 순서: Papago 기계번역 → Claude 번역 보정
 * @param {string} lyrics - 원문 영문 가사
 * @returns {Promise<string|null>} - 최종 번역 결과 또는 null
 */
async function processTranslation(lyrics) {
  console.log(":로켓: 전체 번역 프로세스 시작");
  const totalStartTime = performance.now();
  // 1. Papago 번역 실행 (입력 자동 감지 → 한국어)
  const papagoResult = await translateWithPapago(lyrics);
  if (!papagoResult || papagoResult.trim().length === 0 || papagoResult.trim() === "...") {
    console.error(":x: Papago 번역 실패: Claude에게 원문을 전달하지 않습니다.");
    return null;
  }
  // 2. Claude 3.5 Sonnet을 이용한 번역 보정 실행 (한국어 → 한국어 품질 개선)
  const refinedResult = await refineTranslation(lyrics, papagoResult);
  const totalEndTime = performance.now();
  console.log(`:로켓: 전체 번역 프로세스 완료 (총 소요 시간: ${(totalEndTime - totalStartTime).toFixed(2)}ms)`);
  return refinedResult;
}

router.post('/', async (req, res) => { //02.13 파파고 번역표기 추가
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
    // 1. Papago 번역 진행 및 결과 전송
    const papagoResult = await translateWithPapago(lyrics);
    if (!papagoResult) {
      res.write(`data: ${JSON.stringify({ stage: 'error', message: 'Papago 번역 실패' })}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ stage: 'papago', translation: papagoResult })}\n\n`);
    
    // Papago 번역 결과가 클라이언트에 표시되도록 2초 정도 대기
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. "번역 보정 진행중..." 메시지 전송
    res.write(`data: ${JSON.stringify({ stage: 'update', translation: '번역 보정 진행중...' })}\n\n`);
    
    // 3. AI 번역(최종 번역) 진행 및 결과 전송
    const refinedResult = await refineTranslation(lyrics, papagoResult);
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
