const SETTINGS_KEY = "ai-test-case-settings-v1";
const HISTORY_KEY = "ai-test-case-chat-history-v1";
const extensionApi = globalThis.chrome;

const defaults = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  strictSchema: true
};

const state = {
  sessionId: crypto.randomUUID(),
  messages: [],
  cases: [],
  settings: { ...defaults },
  isSending: false
};

const els = {
  messages: document.querySelector("#messages"),
  chatInput: document.querySelector("#chatInput"),
  sendBtn: document.querySelector("#sendBtn"),
  settingsBtn: document.querySelector("#settingsBtn"),
  historyBtn: document.querySelector("#historyBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  statusText: document.querySelector("#statusText")
};

async function getStored(key, fallback) {
  if (extensionApi?.storage) {
    return await new Promise((resolve) => {
      extensionApi.storage.local.get({ [key]: fallback }, (result) => resolve(result[key]));
    });
  }
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(fallback) ? (stored || fallback) : { ...fallback, ...(stored || {}) };
  } catch {
    return fallback;
  }
}

async function setStored(key, value) {
  if (extensionApi?.storage) {
    await extensionApi.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

function setStatus(text, mode = "") {
  els.statusText.textContent = text;
  if (mode) {
    els.statusText.dataset.mode = mode;
  } else {
    delete els.statusText.dataset.mode;
  }
}

function addMessage(role, html, extraClass = "") {
  const node = document.createElement("article");
  node.className = `message ${role} ${extraClass}`.trim();
  const label = role === "user" ? "You" : "AI";
  node.innerHTML = role === "user"
    ? `<div class="content">${html}</div>`
    : `<div class="role"><span class="role-badge">${label}</span></div><div class="content">${html}</div>`;
  els.messages.appendChild(node);
  els.messages.scrollTop = els.messages.scrollHeight;
  return node;
}

function addPlainMessage(role, text) {
  addMessage(role, `<p>${escapeHtml(text)}</p>`);
}

async function loadSettings() {
  state.settings = { ...defaults, ...(await getStored(SETTINGS_KEY, defaults)) };
  if (state.settings.apiKey) {
    setStatus("已配置", "llm");
    addPlainMessage("ai", `已加载本地模型配置：${state.settings.model}`);
  } else {
    setStatus("未配置");
    addMessage("ai", `<p>请先配置 API Key。Key 只会保存在你的浏览器本地。</p><div class="message-tools"><button class="message-action" data-action="open-options" type="button">打开设置</button></div>`);
  }
}

async function openOptions() {
  if (extensionApi?.runtime?.openOptionsPage) {
    extensionApi.runtime.openOptionsPage();
    return;
  }
  window.open("options.html", "_blank");
}

async function sendChat() {
  if (state.isSending) return;

  const content = els.chatInput.value.trim();
  if (!content) {
    setStatus("请输入需求");
    return;
  }

  state.isSending = true;
  setLoading(true);

  state.settings = { ...defaults, ...(await getStored(SETTINGS_KEY, defaults)) };
  if (!state.settings.apiKey) {
    addMessage("ai", `<p>还没有配置 API Key。请打开设置，填写你的模型服务信息。</p><div class="message-tools"><button class="message-action" data-action="open-options" type="button">打开设置</button></div>`);
    setStatus("未配置");
    setLoading(false);
    state.isSending = false;
    return;
  }

  els.chatInput.value = "";
  state.messages.push({ role: "user", content });
  addPlainMessage("user", content);
  const loadingNode = addMessage("ai", "<p>正在分析需求...</p>", "pending");

  try {
    const result = await callModel(state.settings, state.messages);
    loadingNode.remove();

    const assistantText = result.message || "已完成。";
    state.messages.push({ role: "assistant", content: assistantText });

    if (Array.isArray(result.cases) && result.cases.length) {
      state.cases = normalizeCases(result.cases);
      addMessage("ai", `
        <p>${escapeHtml(assistantText)}</p>
        <p class="mode-note">来源：你本地配置的模型 ${escapeHtml(state.settings.model)}</p>
        ${renderCaseTable(state.cases)}
        ${renderExportActions()}
      `);
      await saveHistory();
    } else {
      addMessage("ai", `<p>${escapeHtml(assistantText)}</p><p class="mode-note">来源：你本地配置的模型 ${escapeHtml(state.settings.model)}</p>`);
    }
    setStatus("已回复", "llm");
  } catch (error) {
    loadingNode.remove();
    addMessage("ai", `<p>请求失败：${escapeHtml(error.message)}</p><p>请检查 API Key、接口地址 Base URL、模型名称，以及插件访问权限。</p>`);
    setStatus("请求失败");
  } finally {
    setLoading(false);
    state.isSending = false;
  }
}

async function callModel(settings, messages) {
  const payload = {
    model: settings.model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      ...messages
    ],
    temperature: 0.2,
    response_format: buildResponseFormat(settings.strictSchema)
  };

  const response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content || "";
  return parseModelJson(content);
}

function buildSystemPrompt() {
  return globalThis.TEST_CASE_SYSTEM_PROMPT || "";
}

function buildResponseFormat(strictSchema) {
  if (!strictSchema) return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: {
      name: "test_case_chat_response",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["message", "cases"],
        properties: {
          message: { type: "string" },
          cases: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "priority", "type", "precondition", "steps", "expected"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
                type: { type: "string" },
                precondition: { type: "string" },
                steps: { type: "string" },
                expected: { type: "string" }
              }
            }
          }
        }
      }
    }
  };
}

function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型没有返回有效 JSON。");
    return JSON.parse(match[0]);
  }
}

function setLoading(isLoading) {
  els.sendBtn.disabled = isLoading;
  els.chatInput.disabled = isLoading;
  if (isLoading) setStatus("Generating");
}

function normalizeCases(cases) {
  return cases.map((item, index) => ({
    id: item.id || `TC-${String(index + 1).padStart(3, "0")}`,
    title: item.title || "未命名测试用例",
    priority: item.priority || "P1",
    type: item.type || "功能测试",
    precondition: item.precondition || "",
    steps: Array.isArray(item.steps) ? item.steps.join("; ") : (item.steps || ""),
    expected: item.expected || ""
  }));
}

function renderCaseTable(cases) {
  const rows = cases.map((item) => `
    <tr>
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.priority)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.precondition)}</td>
      <td>${escapeHtml(item.steps)}</td>
      <td>${escapeHtml(item.expected)}</td>
    </tr>
  `).join("");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>编号</th>
            <th>标题</th>
            <th>优先级</th>
            <th>类型</th>
            <th>前置条件</th>
            <th>测试步骤</th>
            <th>预期结果</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderExportActions() {
  return `
    <div class="message-tools">
      <button class="message-action" data-action="export-csv" type="button">CSV</button>
      <button data-action="export-json" type="button">JSON</button>
      <button data-action="export-md" type="button">Markdown</button>
    </div>
  `;
}

function exportCsv() {
  const header = ["编号", "标题", "优先级", "类型", "前置条件", "测试步骤", "预期结果"];
  const rows = state.cases.map((item) => [item.id, item.title, item.priority, item.type, item.precondition, item.steps, item.expected]);
  downloadFile("test-cases.csv", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
}

function exportJson() {
  downloadFile("test-cases.json", JSON.stringify({ messages: state.messages, cases: state.cases }, null, 2), "application/json;charset=utf-8");
}

function exportMarkdown() {
  const lines = [
    "# 测试用例",
    "",
    "| 编号 | 标题 | 优先级 | 类型 | 前置条件 | 测试步骤 | 预期结果 |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];
  state.cases.forEach((item) => {
    lines.push([item.id, item.title, item.priority, item.type, item.precondition, item.steps, item.expected].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  });
  downloadFile("test-cases.md", lines.join("\n"), "text/markdown;charset=utf-8");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([`\ufeff${content}`], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveHistory() {
  if (!state.cases.length) return;
  const item = {
    sessionId: state.sessionId,
    messages: state.messages,
    cases: state.cases,
    createdAt: new Date().toISOString()
  };
  const history = await getStored(HISTORY_KEY, []);
  history.unshift(item);
  await setStored(HISTORY_KEY, history.slice(0, 20));
}

async function showHistory() {
  renderHistory(await getStored(HISTORY_KEY, []));
}

function renderHistory(history) {
  if (!history.length) {
    addPlainMessage("ai", "暂无历史记录。生成测试用例后，会自动保存最近会话。");
    return;
  }
  const cards = history.slice(0, 5).map((item, index) => {
    const firstUser = item.messages.find((message) => message.role === "user")?.content || "未命名会话";
    return `
      <div class="case-card">
        <strong>${escapeHtml(firstUser.slice(0, 80))}</strong>
        <p>${new Date(item.createdAt).toLocaleString()}，${item.cases.length} 条用例</p>
        <button data-action="reuse-history" data-index="${index}" type="button">打开</button>
      </div>
    `;
  }).join("");
  addMessage("ai", `<p>最近会话：</p><div class="case-list">${cards}</div>`);
}

async function reuseHistory(index) {
  const item = (await getStored(HISTORY_KEY, []))[index];
  if (!item) return;
  state.sessionId = item.sessionId || crypto.randomUUID();
  state.messages = item.messages || [];
  state.cases = item.cases || [];
  els.messages.innerHTML = "";
  state.messages.forEach((message) => addPlainMessage(message.role === "assistant" ? "ai" : "user", message.content));
  if (state.cases.length) {
    addMessage("ai", `<p>该会话最近生成的测试用例：</p>${renderCaseTable(state.cases)}${renderExportActions()}`);
  }
  setStatus("已打开历史", state.settings.apiKey ? "llm" : "");
}

function startNewSession() {
  state.sessionId = crypto.randomUUID();
  state.messages = [];
  state.cases = [];
  els.messages.innerHTML = "";
  els.chatInput.value = "";
  setStatus(state.settings.apiKey ? "已配置" : "未配置", state.settings.apiKey ? "llm" : "");
  addPlainMessage("ai", "请发送需求文案。我会在信息不足时先追问，信息足够时生成结构化测试用例。");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function handleChatInputKeydown(event) {
  const isEnter = event.key === "Enter" || event.code === "Enter" || event.keyCode === 13;
  if (!isEnter) return;
  if (event.shiftKey) return;
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  sendChat();
}

els.sendBtn.addEventListener("click", sendChat);
els.settingsBtn.addEventListener("click", openOptions);
els.historyBtn.addEventListener("click", showHistory);
els.clearBtn.addEventListener("click", startNewSession);
els.chatInput.addEventListener("keydown", handleChatInputKeydown, true);

els.messages.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "open-options") openOptions();
  if (button.dataset.action === "export-csv") exportCsv();
  if (button.dataset.action === "export-json") exportJson();
  if (button.dataset.action === "export-md") exportMarkdown();
  if (button.dataset.action === "reuse-history") reuseHistory(Number(button.dataset.index));
});

startNewSession();
loadSettings();
