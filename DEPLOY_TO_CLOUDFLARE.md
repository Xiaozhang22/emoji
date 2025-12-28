# Cloudflare 部署与配置完全指南

本指南将指导你完成从 GitHub 到 Cloudflare 的全流程配置。
我们的目标是：**代码只管推送到 GitHub，Cloudflare 会自动完成部署。**

---

## 第一阶段：Cloudflare 后台准备 (KV 数据库)

在代码部署前，我们需要先在 Cloudflare 上准备好数据库。

1.  登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2.  在左侧菜单点击 **Storage & Databases** (存储与数据库)，然后选择 **KV**。
3.  **创建命名空间 (Create Namespace)**:
    *   点击 **Create a Namespace**。
    *   名称输入：`EMOJI_KV`。
    *   点击 **Add**。
4.  **获取 KV ID**:
    *   创建成功后，你会看到 ID 一栏有一串字符（例如 `406362837380485a8508605333502859`）。
    *   **复制这个 ID**。
5.  **修改本地配置**:
    *   打开本地项目中的 `wrangler.toml` 文件。
    *   找到 `id = "YOUR_KV_NAMESPACE_ID"` 这一行。
    *   将刚才复制的 ID 粘贴进去，保存文件。

---

## 第二阶段：预设数据 (在 Cloudflare 上操作)

我们需要在 KV 里预存一些 API Key，这样你的 App 才能通过鉴权。

1.  在刚才的 KV 页面，点击你创建的 `EMOJI_KV` 的 **View** (查看) 按钮。
2.  选择 **KV Pairs** 标签页。
3.  点击 **Add Entry** (添加条目)。
    *   **Key**: `sk_test_123` (这是给 App 用的测试 Key)。
    *   **Value**: `{"valid": true, "balance": 100}` (或者随便填个 `true`)。
    *   点击 **Add**。
    *   *以后你可以随时在这里添加新的 Key 给不同的用户。*

---

## 第三阶段：获取部署密钥 (Token)

为了让 GitHub 能帮我们将代码上传到 Cloudflare，我们需要给 GitHub 授权。

1.  在 Cloudflare Dashboard 右上角点击你的头像 -> **My Profile**。
2.  点击左侧 **API Tokens**。
3.  点击 **Create Token**。
4.  使用模板 **Edit Cloudflare Workers** (点击 Use template)。
5.  **Permissions** (权限) 保持默认即可 (Account - Workers Scripts - Edit...)。
6.  点击 **Continue to summary** -> **Create Token**。
7.  **复制显示的 Token** (这串字符只显示一次，请保管好)。

同时，回到 Dashboard 首页，在右下角找到 **Account ID**，也复制下来。

---

## 第四阶段：GitHub 仓库设置

1.  将本地所有文件（包含刚修改的 `wrangler.toml`）提交并推送 (Push) 到你的 GitHub 仓库。
2.  打开你的 GitHub 仓库网页。
3.  点击 **Settings** (设置) -> **Secrets and variables** -> **Actions**。
4.  点击 **New repository secret**，添加以下两个变量：
    *   Name: `CLOUDFLARE_API_TOKEN`
        *   Value: (粘贴刚才复制的长 Token)
    *   Name: `CLOUDFLARE_ACCOUNT_ID`
        *   Value: (粘贴刚才复制的 Account ID)

**一旦添加完成，点击 GitHub 顶部的 "Actions" 标签，你会发现部署任务已经自动开始了！**

---

## 第五阶段：配置 ModelScope 密钥

代码部署上去后，还需要告诉 Worker 你的魔搭 (ModelScope) 密码。

1.  回到 Cloudflare Dashboard -> **Workers & Pages**。
2.  你会看到一个新的 Worker (名字通常叫 `emoji-gen-api`，取决于 `wrangler.toml` 里的 name)。点击进入。
3.  点击 **Settings** (设置) -> **Variables and Secrets** (变量与密钥)。
4.  点击 **Add** (添加变量)。
    *   **Variable name**: `MODELSCOPE_API_KEY`
    *   **Value**: (填入你在魔搭社区获取的 Token)
    *   点击 **Encrypt** (加密) 按钮，然后 **Save**。

5.  **最后一步：重新部署**
    *   由于添加了环境变量，建议去 GitHub 仓库的 Actions 页面，点击最新的那个 Workflow，选择 **Re-run jobs**，或者随便改个文件再次 Push。
    *   或者在 Cloudflare Worker 页面右上角点击 **Deploy** (如果有)。通常更新变量后会自动生效，无需重新部署。

---

## 第六阶段：验证与使用

1.  在 Worker 页面，你可以看到 **Preview URL** (例如 `https://emoji-gen-api.你的名字.workers.dev`)。
2.  使用测试工具 (Postman 或 curl) 发送请求：

    **URL**: `https://emoji-gen-api.你的名字.workers.dev`
    **Method**: `POST`
    **Body (JSON)**:
    ```json
    {
      "prompt": "一只戴帽子的猫",
      "count": 2,
      "apiKey": "sk_test_123"
    }
    ```

3.  如果返回了 Base64 图片数据，说明一切正常！