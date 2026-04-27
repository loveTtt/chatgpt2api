<h1 align="center">ChatGPT2API</h1>

<p align="center">一个面向公益生图场景的 ChatGPT 图片代理与在线工作台。</p>

<p align="center">
  提供 OpenAI 兼容图片接口、在线文生图 / 编辑图界面、公开作品页、image_link 鉴权配额，以及多种账号导入与自托管部署能力。
</p>

> [!NOTE]
> 感谢原项目 [basketikun/chatgpt2api](https://github.com/basketikun/chatgpt2api) 的开源工作。
>
> 本仓库基于原项目 fork，并在此基础上持续演进，增加了公开作品、image_link 配额、提示词公开控制、分享访问隔离等能力。

> [!WARNING]
> 免责声明：
>
> 本项目涉及对 ChatGPT 官网文本生成、图片生成与图片编辑等相关接口的逆向研究，仅供个人学习、技术研究与非商业性技术交流使用。
>
> - 严禁将本项目用于任何商业用途、盈利性使用、批量操作、自动化滥用或规模化调用。
> - 严禁将本项目用于破坏市场秩序、恶意竞争、套利倒卖、二次售卖相关服务，以及任何违反 OpenAI 服务条款或当地法律法规的行为。
> - 严禁将本项目用于生成、传播或协助生成违法、暴力、色情、未成年人相关内容，或用于诈骗、欺诈、骚扰等非法或不当用途。
> - 使用者应自行承担全部风险，包括但不限于账号被限制、临时封禁或永久封禁以及因违规使用等所导致的法律责任。
> - 使用本项目即视为你已充分理解并同意本免责声明全部内容；如因滥用、违规或违法使用造成任何后果，均由使用者自行承担。

> [!IMPORTANT]
> 本项目基于对 ChatGPT 官网相关能力的逆向研究实现，存在账号受限、临时封禁或永久封禁的风险。请勿使用你自己的重要账号、常用账号或高价值账号进行测试。

> [!CAUTION]
> 旧版本存在已知漏洞，请尽快升级到最新版本。公网部署时请尽量不要放置敏感信息，并自行做好访问控制与隔离。

## 项目简介

ChatGPT2API 目前聚焦在图片相关能力，适合需要自托管生图入口、统一管理 OAuth 账号、对外暴露 OpenAI 兼容接口，或直接给内部用户提供在线画图页的场景。

当前已经支持：

- OpenAI 兼容的图片生成、图片编辑、图片场景 `chat/completions` 与 `responses` 接口
- 在线文生图、编辑图、多图队列、参考图上传、历史记录持久化
- 公开作品页、分享链接、是否公开提示词、异步生成作品标题
- image_link 鉴权、额度扣减、公开提示词免扣额度
- 本地导入、CPA 导入、sub2api 导入、代理配置与账号池管理
- Docker 自托管部署，以及 `json / sqlite / postgres / git` 多存储后端切换

## 快速开始

### 方式一：直接用 Docker Compose 启动

适合快速试跑完整应用，默认会同时提供后端 API 和打包后的前端页面。

```bash
git clone https://github.com/loveTtt/chatgpt2api.git
cd chatgpt2api
cp config.json config.local.json # 可选，按你的习惯备份一份配置
# 修改 config.json 中的 auth-key、proxy、refresh_account_interval_minute

docker compose up -d --build
```

启动后默认访问：

- Web 界面：`http://localhost:3000`
- 容器内 API 也通过同一个入口暴露

默认挂载：

- `./config.json` → `/app/config.json`
- `./data` → `/app/data`

### 方式二：本地开发启动

适合需要同时调试 Python API 和 Next.js 前端的场景。

后端：

```bash
uv sync
uv run python main.py
```

默认监听：`http://127.0.0.1:8000`

前端：

```bash
cd web
npm install
npm run dev
```

默认监听：`http://127.0.0.1:3000`

前端开发环境会自动请求 `http://127.0.0.1:8000` 的 API。

## 配置说明

### 基础配置

默认配置文件是根目录的 `config.json`：

```json
{
  "auth-key": "chatgpt2api",
  "refresh_account_interval_minute": 60,
  "proxy": "http://127.0.0.1:7897",
  "base_url": ""
}
```

常用字段：

- `auth-key`：API 与 Web 登录共用的访问密钥
- `refresh_account_interval_minute`：限流账号自动刷新间隔
- `proxy`：访问上游时使用的代理
- `base_url`：公开图片与分享链接生成时使用的基础地址

### 存储后端

支持通过环境变量 `STORAGE_BACKEND` 切换存储方式：

- `json`：本地 JSON 文件（默认）
- `sqlite`：本地 SQLite 数据库
- `postgres`：外部 PostgreSQL
- `git`：Git 私有仓库存储

`docker-compose.local.yml` 给了一个 SQLite 示例：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

PostgreSQL 示例：

```yaml
environment:
  STORAGE_BACKEND: postgres
  DATABASE_URL: postgresql://user:password@host:5432/dbname
```

## 功能概览

### API 兼容能力

- 兼容 `POST /v1/images/generations` 图片生成接口
- 兼容 `POST /v1/images/edits` 图片编辑接口
- 兼容面向图片场景的 `POST /v1/chat/completions`
- 兼容面向图片场景的 `POST /v1/responses`
- `GET /v1/models` 返回 `gpt-image-2`、`codex-gpt-image-2`、`auto`、`gpt-5`、`gpt-5-1`、`gpt-5-2`、`gpt-5-3`、`gpt-5-3-mini`、`gpt-5-mini`
- 支持通过 `n` 返回多张生成结果
- 支持 Codex 中的画图接口逆向，模型别名为 `codex-gpt-image-2`

### 在线画图功能

- 内置在线画图工作台，支持生成、图片编辑与多图组图编辑
- 支持公开作品、公开提示词确认弹窗、异步作品标题生成
- 支持参考图上传、历史记录持久化、继续编辑与多图队列
- 支持服务端保存公开图片并生成分享链接

### 账号与接入管理

- 自动刷新账号邮箱、类型、额度和恢复时间
- 轮询可用账号执行图片生成与图片编辑
- 遇到 Token 失效类错误时自动剔除无效 Token
- 支持网页端配置全局 HTTP / HTTPS / SOCKS5 / SOCKS5H 代理
- 支持本地 CPA JSON、远程 CPA、sub2api、`access_token` 导入
- 支持 image_link 配额、公开提示词免扣额度与权限隔离

### 实验性 / 规划中

- `/v1/complete` 文本补全与流式输出已实现，但仍在测试，目前会出现对话重复的问题，请谨慎测试使用
- 详细状态说明见：[功能清单](./docs/feature-status.en.md)

## Screenshots

文生图界面：

![image](assets/image.png)

编辑图：

![image](assets/image_edit.png)

Cherry Studio 中使用，支持作为绘图接口接入：

![image](assets/chery_studio.png)

号池管理：

![image](assets/account_pool.png)

New Api 接入：

![image](assets/new_api.png)

## API

所有 AI 接口都需要请求头：

```http
Authorization: Bearer <auth-key>
```

<details>
<summary><code>GET /v1/models</code></summary>
<br>

返回当前暴露的图片模型列表。

```bash
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer <auth-key>"
```

<details>
<summary>说明</summary>
<br>

| 字段 | 说明 |
|:---|:---|
| 返回模型 | `gpt-image-2`、`codex-gpt-image-2`、`auto`、`gpt-5`、`gpt-5-1`、`gpt-5-2`、`gpt-5-3`、`gpt-5-3-mini`、`gpt-5-mini` |
| 接入场景 | 可接入 Cherry Studio、New API 等上游或客户端 |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/images/generations</code></summary>
<br>

OpenAI 兼容图片生成接口，用于文生图。

```bash
curl http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "一只漂浮在太空里的猫",
    "n": 1,
    "response_format": "b64_json"
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段 | 说明 |
|:---|:---|
| `model` | 图片模型，当前可用值以 `/v1/models` 返回结果为准，推荐使用 `gpt-image-2` |
| `prompt` | 图片生成提示词 |
| `n` | 生成数量，当前后端限制为 `1-4` |
| `response_format` | 当前默认值为 `b64_json` |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/images/edits</code></summary>
<br>

OpenAI 兼容图片编辑接口，用于上传图片并生成编辑结果。

```bash
curl http://localhost:8000/v1/images/edits \
  -H "Authorization: Bearer <auth-key>" \
  -F "model=gpt-image-2" \
  -F "prompt=把这张图改成赛博朋克夜景风格" \
  -F "n=1" \
  -F "image=@./input.png"
```

<details>
<summary>字段说明</summary>
<br>

| 字段 | 说明 |
|:---|:---|
| `model` | 图片模型，`gpt-image-2` |
| `prompt` | 图片编辑提示词 |
| `n` | 生成数量，当前后端限制为 `1-4` |
| `image` | 需要编辑的图片文件，使用 multipart/form-data 上传 |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/chat/completions</code></summary>
<br>

面向图片场景的 Chat Completions 兼容接口，不是完整通用聊天代理。

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-image-2",
    "messages": [
      {
        "role": "user",
        "content": "生成一张雨夜东京街头的赛博朋克猫"
      }
    ],
    "n": 1
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段 | 说明 |
|:---|:---|
| `model` | 图片模型，默认按图片生成场景处理 |
| `messages` | 消息数组，需要是图片相关请求内容 |
| `n` | 生成数量，按当前实现解析为图片数量 |
| `stream` | 已实现，但仍在测试 |

<br>
</details>
</details>

<details>
<summary><code>POST /v1/responses</code></summary>
<br>

面向图片生成工具调用的 Responses API 兼容接口，不是完整通用 Responses API 代理。

```bash
curl http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <auth-key>" \
  -d '{
    "model": "gpt-5",
    "input": "生成一张未来感城市天际线图片",
    "tools": [
      {
        "type": "image_generation"
      }
    ]
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段 | 说明 |
|:---|:---|
| `model` | 文本模型 + 图片工具调用组合，常见用法为 `gpt-5` |
| `input` | 输入文本 |
| `tools` | 需要包含 `image_generation` 工具 |
| `stream` | 已实现，适合流式消费 |

<br>
</details>
</details>

## 相关说明

- 默认登录和接口鉴权都使用同一个 `auth-key`
- 公开作品列表现在要求已授权访问，分享链接仍允许匿名查看单个作品
- image_link 用户公开提示词时可使用免扣额度，admin 与普通 user 不参与这套扣减逻辑

## License

本仓库当前未附带独立开源许可证文件。使用前请先阅读上方免责声明，并自行评估风险与合规要求。


<details>
<summary>字段说明</summary>
<br>

| 字段       | 说明                            |
|:---------|:------------------------------|
| `model`  | 响应中会回显该模型字段，但图片生成当前仍走图片生成兼容逻辑 |
| `input`  | 输入内容，需要能解析出图片生成提示词            |
| `tools`  | 必须包含 `image_generation` 工具请求  |
| `stream` | 已实现，但仍在测试                     |

<br>
</details>
</details>

## 社区支持

学 AI , 上 L 站：[LinuxDO](https://linux.do)

## Contributors

感谢所有为本项目做出贡献的开发者：

<a href="https://github.com/loveTtt/chatgpt2api.git/graphs/contributors">
  <img alt="Contributors" src="https://contrib.rocks/image?repo=loveTtt/chatgpt2api" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=loveTtt/chatgpt2api&type=date&legend=top-left)](https://www.star-history.com/?repos=loveTtt%2Fchatgpt2api&type=date&legend=top-left)
