# AI 测试用例设计助手 Chrome 插件

这是一个本地优先的 Chrome 插件 MVP。

插件正常使用不依赖项目后端。用户在插件设置页配置自己的 OpenAI 兼容 API Key，插件直接从浏览器调用用户配置的模型服务。

## 在 Chrome 中加载

1. 打开 `chrome://extensions`。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择当前插件目录。
5. 打开插件设置页，配置：

   - API Key
   - 接口地址 Base URL
   - 模型名称

6. 点击插件图标打开侧边栏。

## 本地调试启动

运行以下脚本，可以启动独立调试浏览器并直接打开插件页面：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-chrome-dev.ps1
```

启动脚本会优先使用 Chrome for Testing，因为新版普通 Chrome 可能会忽略 `--load-extension` 命令行参数。如果没有安装 Chrome for Testing，脚本会回退到普通 Chrome，并打开 `chrome://extensions` 供手动加载。

## 验收与示例

- 手动验收步骤见 `docs/验收清单.md`。
- 可复用的样例需求和期望输出形态见 `docs/示例需求与输出.md`。

## 数据与 Key 处理

- API Key 保存在 `chrome.storage.local`。
- 聊天历史和生成的测试用例保存在 `chrome.storage.local`。
- 插件只会把需求文案发送到用户自己配置的模型接口。
- 插件作者不会接收用户数据。

## 当前 MVP 流程

```text
用户输入需求文案
  -> 侧边栏读取本地模型设置
  -> 侧边栏调用用户配置的 /chat/completions 接口
  -> 模型返回回复和可选测试用例
  -> 侧边栏渲染聊天回复和测试用例表格
  -> 用户导出 XMind Markdown
```

## 当前能力

- 类 Codex 的聊天侧边栏。
- 用户自有 API Key 和模型设置。
- 当前会话内多轮上下文。
- 需求不清晰时先追问。
- 信息足够时生成结构化测试用例。
- 系统提示词独立维护在 `prompts.js`。
- 支持导出 XMind Markdown。
- 最近会话保存在插件本地存储，包含追问会话和已生成用例的会话。

## 当前暂不包含

- 后端服务依赖。
- 读取当前页面 DOM。
- Jira / 禅道集成。
- 插件内文件上传解析。
- 知识库 / RAG。
- 截图 OCR。
- 平台回写。
