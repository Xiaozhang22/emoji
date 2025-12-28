# 微信表情包文生图应用 - 产品需求文档 (PRD)

## 1. 项目概述 (Project Overview)
本项目旨在开发一款基于 AI 的微信表情包生成工具。用户通过 App 输入文字描述（Prompt），系统通过 Cloudflare Workers 中转，调用 ModelScope（魔搭社区）的文生图 API，批量生成 1-16 张表情包风格图片。生成的图片不保存在后端服务器，直接流转至 App 端，由 App 完成去背并分享至微信。

**核心理念：** Serverless（无服务器）、无状态（不存图）、低成本、高隐私。

## 2. 系统架构 (System Architecture)

*   **前端交互层 (Client):** iOS / Android 原生 App。
*   **业务逻辑层 (Middleware):** Cloudflare Workers (负责鉴权、Prompt 优化、并发调用 ModelScope)。
*   **AI 模型层 (Model Provider):** ModelScope API (提供文生图能力)。
*   **数据存储层 (Data Store):** Cloudflare KV (仅存储 API Key、用户配额、访问日志，**不存图片**)。
*   **Web 端:** Cloudflare Pages (仅作为落地页或简单的后台管理，不涉及核心生成业务)。

## 3. 功能需求 (Functional Requirements)

### 3.1 移动端 App (iOS/Android)

| 模块 | 功能点 | 详细描述 |
| :--- | :--- | :--- |
| **设置** | **生成数量配置** | 用户可在设置页配置一次生成的图片数量，范围 **1 - 16 张**。 |
| **生成** | **Prompt 输入** | 提供文本输入框，允许用户输入描述（如“一只生气的猫”）。 |
| | **发起请求** | 点击生成按钮，将 Prompt、生成数量、App 身份凭证发送给后端。 |
| | **状态展示** | 显示生成进度条或加载动画（生成 16 张图可能需要数秒）。 |
| **展示** | **结果预览** | 以网格形式展示生成的图片（Base64 解码或临时 URL）。 |
| **编辑** | **本地去背** | (核心) App 接收图片后，调用本地系统库（Vision/ML Kit）去除白色背景。 |
| **输出** | **发送到微信** | 将处理后的透明 PNG/GIF 直接调用微信 SDK 发送给好友或添加到表情。 |

### 3.2 后端服务 (Cloudflare Workers)

| 模块 | 功能点 | 详细描述 |
| :--- | :--- | :--- |
| **鉴权** | **API Key 验证** | 验证 App 请求头中的 Key 是否在 Cloudflare KV 中有效，并检查剩余配额。 |
| **处理** | **Prompt 优化** | 接收用户 Prompt，自动追加表情包魔法词（如 `sticker style, vector, white background, expressive`）。 |
| **编排** | **ModelScope 接入** | 封装 ModelScope 的 API 调用逻辑 (HTTP Client)。 |
| | **并发控制** | 根据用户请求的数量 (N=1~16)，向 ModelScope 发起并发请求 (Promise.all)。 |
| | **数据转换** | 接收 ModelScope 返回的图片结果，统一封装为 JSON 格式（Base64 列表）返回给 App。 |
| **日志** | **KV 记录** | 记录本次请求的时间、Token 消耗、Prompt 内容到 Cloudflare KV。 |

### 3.3 Web 端 (Cloudflare Pages)

*   **功能：** 项目介绍落地页、App 下载链接。
*   **扩展（可选）：** 用户查询自己的剩余点数/日志（通过读取 KV）。

## 4. API 接口定义 (Draft)

**Endpoint:** `POST https://api.your-domain.com/generate`

**请求体 (Request Body):**
```json
{
  "prompt": "一只拿着咖啡的狗",
  "count": 4,  // 用户设置的生成数量 (1-16)
  "app_key": "sk_user_123456"
}
```

**响应体 (Response Body):**
```json
{
  "success": true,
  "data": {
    "images": [
      "base64_string_image_1...",
      "base64_string_image_2...",
      "base64_string_image_3..."
    ],
    "usage": {
      "prompt_tokens": 12,
      "generated_count": 4
    }
  },
  "message": "生成成功"
}
```

## 5. 关键业务流程 (User Flow)

1.  **用户**在 App 设置中选择“一次生成 4 张”。
2.  **用户**输入“开心的小狗”并点击生成。
3.  **App** 发送请求到 **Cloudflare Worker**。
4.  **Worker** 验证 Key 通过，将 Prompt 改写为 `(sticker style), 开心的小狗, vector, white background`。
5.  **Worker** 根据 count=4，向 **ModelScope API** 发起并发请求。
6.  **ModelScope** 返回 4 张图片数据。
7.  **Worker** 聚合数据，记录日志到 **KV**，将 4 张图的 Base64 数组返回给 **App**。
8.  **App** 收到数据，展示 4 张图，并自动进行背景去除。
9.  **用户**点击其中一张，选择“发送给微信好友”。

## 6. 技术风险与应对 (Risks & Solutions)

| 风险点 | 描述 | 解决方案 |
| :--- | :--- | :--- |
| **Worker 超时** | Cloudflare Worker 免费版 CPU 时间有限，生成 16 张图可能导致 HTTP 超时。 | 1. 限制单次最大并发数。<br>2. ModelScope 若支持 batch_size 参数优先使用。<br>3. 若 16 张太慢，App 端改为分批多次请求。 |
| **ModelScope 成本** | ModelScope 部分模型收费。 | 关注 ModelScope 的免费额度，KV 中做好严格的配额管理。 |
| **流量消耗** | 16 张 Base64 图片体积较大。 | 在 Worker 端对图片进行轻度压缩后再转 Base64。 |
