/**
 * Emoji Generation Worker
 * 
 * 逻辑流程:
 * 1. 接收 App 请求 (Prompt, Count)
 * 2. 鉴权
 * 3. 优化 Prompt (加入表情包风格词)
 * 4. 并发调用 ModelScope 提交任务
 * 5. 轮询任务状态直到完成
 * 6. 下载图片并转 Base64
 * 7. 返回结果
 */

const CONSTANTS = {
  MODELSCOPE_URL: 'https://api-inference.modelscope.cn/v1/images/generations',
  TASK_URL_BASE: 'https://api-inference.modelscope.cn/v1/tasks/',
  MODEL_ID: 'Tongyi-MAI/Z-Image-Turbo', // 速度快，适合表情包
  MAX_POLL_ATTEMPTS: 20, // 最大轮询次数
  POLL_INTERVAL: 1000,   // 轮询间隔 (ms)
};

export default {
  async fetch(request, env, ctx) {
    // 1. CORS 设置 (允许 App 调用)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      // DEBUG: 检查 Key 是否存在
      const key = env.MODELSCOPE_API_KEY;
      if (!key) throw new Error("API Key is missing in Worker Environment");

      const body = await request.json();
      const { prompt, count = 1, apiKey } = body;

      // 2. 简单鉴权 (对比 KV 中的 Key)
      // const isValidUser = await env.EMOJI_KV.get(apiKey);
      // if (!isValidUser) return new Response('Unauthorized', { status: 401 });
      
      // 3. Prompt 优化 (预设 Emoji 风格)
      const refinedPrompt = refinePrompt(prompt);

      // 4. 并发执行任务
      const actualCount = Math.min(Math.max(1, count), 16); // 限制 1-16
      const tasks = [];

      for (let i = 0; i < actualCount; i++) {
        tasks.push(generateSingleImage(refinedPrompt, env.MODELSCOPE_API_KEY));
      }

      // 等待所有任务完成
      const results = await Promise.all(tasks);

      // 过滤失败的，只返回成功的 Base64
      const successfulImages = results.filter(r => r.success).map(r => r.base64);
      const errors = results.filter(r => !r.success).map(r => r.error);

      // 5. 记录日志 (可选)
      // ctx.waitUntil(env.EMOJI_KV.put(`log:${Date.now()}`, JSON.stringify({ prompt, count: actualCount })));

      return new Response(JSON.stringify({
        success: successfulImages.length > 0,
        images: successfulImages,
        total: successfulImages.length,
        errors: errors,
        prompt_used: refinedPrompt
      }), {
        headers: { 
          'Content-Type': 'application/json',
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (e) {
      // 获取 Key 信息用于调试
      const key = env.MODELSCOPE_API_KEY;
      const keyInfo = key ? `Length: ${key.length}, Start: ${key.substring(0, 2)}...` : "MISSING/UNDEFINED";
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: e.message,
        debug_key_info: keyInfo 
      }), { status: 500 });
    }
  },
};

/**
 * 核心：Prompt 优化工程
 */
function refinePrompt(userPrompt) {
  const styleKeywords = [
    "sticker style",            // 贴纸风格
    "die-cut sticker",          // 模切贴纸 (有白边)
    "white background",         // 白底 (方便去背)
    "vector illustration",      // 矢量插画
    "minimalist",               // 极简
    "cute",                     // 可爱
    "chibi",                    // Q版
    "expressive emotion",       // 表情丰富
    "high quality",             // 高质量
    "soft lighting"             // 柔光 (增强 3D 感)
  ];
  return `${styleKeywords.join(", ")}, ${userPrompt}`;
}

/**
 * 单张图片生成全流程
 */
async function generateSingleImage(prompt, token) {
  try {
    const submitBody = {
      model: CONSTANTS.MODEL_ID,
      prompt: prompt
    };

    const submitResCorrect = await fetch(CONSTANTS.MODELSCOPE_URL, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true"
      },
      body: JSON.stringify(submitBody)
    });

    if (!submitResCorrect.ok) {
        const errText = await submitResCorrect.text();
        console.error("Submit failed", errText);
        throw new Error(`ModelScope submit failed: ${submitResCorrect.status}`);
    }

    const submitData = await submitResCorrect.json();
    const taskId = submitData.task_id;

    if (!taskId) throw new Error("No task_id received");

    // B. 轮询状态
    let imageUrl = null;
    for (let i = 0; i < CONSTANTS.MAX_POLL_ATTEMPTS; i++) {
      await new Promise(r => setTimeout(r, CONSTANTS.POLL_INTERVAL)); // 等待 1s

      const pollRes = await fetch(`${CONSTANTS.TASK_URL_BASE}${taskId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-ModelScope-Task-Type": "image_generation"
        }
      });

      const pollData = await pollRes.json();
      
      if (pollData.task_status === 'SUCCEED') {
        if (pollData.output_images && pollData.output_images.length > 0) {
           imageUrl = pollData.output_images[0];
        }
        break;
      } else if (pollData.task_status === 'FAILED') {
        throw new Error("Task failed on ModelScope side");
      }
    }

    if (!imageUrl) throw new Error("Timeout or no image url");

    // C. 下载并转 Base64
    const imageRes = await fetch(imageUrl);
    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = bufferToBase64(imageBuffer);

    return { success: true, base64: base64 };

  } catch (err) {
    console.error("Generation error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 安全地将 ArrayBuffer 转为 Base64
 */
function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 0x8000; 
  
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunkSize, len))
    );
  }
  return btoa(binary);
}