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
  lastRequirement: "",
  settings: { ...defaults },
  isSending: false
};

const els = {
  messages: document.querySelector("#messages"),
  composerWrap: document.querySelector("#composerWrap"),
  chatInput: document.querySelector("#chatInput"),
  sendBtn: document.querySelector("#sendBtn"),
  menuBtn: document.querySelector("#menuBtn"),
  actionMenu: document.querySelector("#actionMenu"),
  settingsBtn: document.querySelector("#settingsBtn"),
  historyBtn: document.querySelector("#historyBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  statusText: document.querySelector("#statusText"),
  settingsPanel: document.querySelector("#settingsPanel"),
  closeSettingsBtn: document.querySelector("#closeSettingsBtn"),
  settingsApiKey: document.querySelector("#settingsApiKey"),
  settingsBaseUrl: document.querySelector("#settingsBaseUrl"),
  settingsModel: document.querySelector("#settingsModel"),
  settingsStrictSchema: document.querySelector("#settingsStrictSchema"),
  saveSettingsBtn: document.querySelector("#saveSettingsBtn"),
  testSettingsBtn: document.querySelector("#testSettingsBtn"),
  deleteSettingsBtn: document.querySelector("#deleteSettingsBtn"),
  toggleKeyBtn: document.querySelector("#toggleKeyBtn"),
  settingsStatusText: document.querySelector("#settingsStatusText"),
  historyPanel: document.querySelector("#historyPanel"),
  historyList: document.querySelector("#historyList"),
  closeHistoryBtn: document.querySelector("#closeHistoryBtn")
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

async function removeStored(key) {
  if (extensionApi?.storage) {
    await extensionApi.storage.local.remove(key);
    return;
  }
  localStorage.removeItem(key);
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
  node.innerHTML = role === "user"
    ? `<div class="content">${html}</div>`
    : `<div class="role"><span class="role-badge"><img src="assets/assistant-avatar.png" alt=""></span></div><div class="content">${html}</div>`;
  els.messages.appendChild(node);
  els.messages.scrollTop = els.messages.scrollHeight;
  return node;
}

function addPlainMessage(role, text) {
  addMessage(role, `<p>${escapeHtml(text)}</p>`);
}

async function loadSettings() {
  state.settings = { ...defaults, ...(await getStored(SETTINGS_KEY, defaults)) };
  populateSettingsForm();
  if (state.settings.apiKey) {
    setStatus("模型已连接", "llm");
    addPlainMessage("ai", `已加载本地模型配置：${state.settings.model}`);
  } else {
    setStatus("模型未配置");
    addMessage("ai", `<p>请先配置 API Key。Key 只会保存在你的浏览器本地。</p><div class="message-tools"><button class="message-action" data-action="open-options" type="button">打开设置</button></div>`);
  }
}

async function openSettingsPanel() {
  closeActionMenu();
  state.settings = { ...defaults, ...(await getStored(SETTINGS_KEY, defaults)) };
  populateSettingsForm();
  showView("settings");
  els.settingsApiKey.focus();
}

function closeSettingsPanel() {
  showView("chat");
}

function showView(view) {
  els.settingsPanel.hidden = view !== "settings";
  els.historyPanel.hidden = view !== "history";
  els.messages.hidden = view !== "chat";
  els.composerWrap.hidden = view !== "chat";
}

function populateSettingsForm() {
  els.settingsApiKey.value = state.settings.apiKey || "";
  els.settingsApiKey.type = "password";
  els.toggleKeyBtn.textContent = "显示";
  els.settingsBaseUrl.value = state.settings.baseUrl || defaults.baseUrl;
  els.settingsModel.value = state.settings.model || defaults.model;
  els.settingsStrictSchema.checked = state.settings.strictSchema !== false;
  setSettingsStatus(state.settings.apiKey ? "已加载当前配置，可直接修改后保存" : "尚未配置 API Key");
}

function readSettingsForm() {
  return {
    apiKey: els.settingsApiKey.value.trim(),
    baseUrl: (els.settingsBaseUrl.value.trim() || defaults.baseUrl).replace(/\/+$/, ""),
    model: els.settingsModel.value.trim() || defaults.model,
    strictSchema: els.settingsStrictSchema.checked
  };
}

function setSettingsStatus(text) {
  els.settingsStatusText.textContent = text;
}

async function saveSettingsFromPanel() {
  state.settings = readSettingsForm();
  await setStored(SETTINGS_KEY, state.settings);
  setStatus(state.settings.apiKey ? "模型已连接" : "模型未配置", state.settings.apiKey ? "llm" : "");
  setSettingsStatus("已保存当前配置");
}

async function deleteSettingsConfig() {
  if (!confirm("确定删除当前模型配置吗？")) return;
  await removeStored(SETTINGS_KEY);
  state.settings = { ...defaults };
  populateSettingsForm();
  setStatus("模型未配置");
  setSettingsStatus("已删除模型配置");
}

function toggleActionMenu() {
  const shouldOpen = els.actionMenu.hidden;
  els.actionMenu.hidden = !shouldOpen;
  els.menuBtn.setAttribute("aria-expanded", String(shouldOpen));
}

function closeActionMenu() {
  els.actionMenu.hidden = true;
  els.menuBtn.setAttribute("aria-expanded", "false");
}

async function testSettingsConnection() {
  const settings = readSettingsForm();
  if (!settings.apiKey) {
    setSettingsStatus("请先填写 API Key");
    return;
  }
  setSettingsStatus("正在测试连接...");
  try {
    await requestChatCompletion(settings, {
      model: settings.model,
      messages: [{ role: "user", content: "请只回复 OK。" }],
      max_tokens: 16
    });
    setSettingsStatus("连接成功");
  } catch (error) {
    setSettingsStatus(`连接失败：${error.message}`);
  }
}

function toggleKeyVisibility() {
  const isHidden = els.settingsApiKey.type === "password";
  els.settingsApiKey.type = isHidden ? "text" : "password";
  els.toggleKeyBtn.textContent = isHidden ? "隐藏" : "显示";
}

async function sendChat(contentOverride = "", visibleContentOverride = "") {
  if (state.isSending) return;

  const content = (contentOverride || els.chatInput.value).trim();
  if (!content) {
    setStatus("请输入需求");
    return;
  }
  const visibleContent = (visibleContentOverride || content).trim();

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
  addPlainMessage("user", visibleContent);
  const loadingNode = addMessage("ai", "<p>正在分析需求...</p>", "pending");

  try {
    const result = await callModel(state.settings, state.messages);
    loadingNode.remove();

    const assistantText = result.message || "已完成。";
    state.messages.push({ role: "assistant", content: assistantText });

    const clarifications = normalizeClarifications(result.clarifications);
    if (Array.isArray(result.cases) && result.cases.length) {
      state.cases = normalizeCases(result.cases);
      state.lastRequirement = content;
      const qualityIssues = inspectCaseQuality(state.cases);
      addMessage("ai", `
        <p>${escapeHtml(assistantText)}</p>
        <p class="mode-note">来源：你本地配置的模型 ${escapeHtml(state.settings.model)}</p>
        ${renderCaseTable(state.cases)}
        ${renderQualityIssues(qualityIssues)}
        ${renderExportActions()}
      `);
    } else {
      addMessage("ai", `
        <p>${escapeHtml(assistantText)}</p>
        ${renderClarifications(clarifications)}
        <p class="mode-note">来源：你本地配置的模型 ${escapeHtml(state.settings.model)}</p>
      `);
    }
    await saveHistory();
    setStatus("已回复", "llm");
  } catch (error) {
    loadingNode.remove();
    addMessage("ai", renderErrorMessage(error));
    setStatus("请求失败");
  } finally {
    setLoading(false);
    state.isSending = false;
  }
}

async function callModel(settings, messages) {
  const modelMessages = [
    { role: "system", content: buildSystemPrompt() },
    ...messages
  ];
  const payload = buildChatPayload(settings, modelMessages, buildResponseFormat(settings.strictSchema), 0.2);
  const content = await requestChatCompletion(settings, payload);

  try {
    return parseModelJson(content);
  } catch (error) {
    if (error.code !== "MODEL_JSON_PARSE_ERROR") throw error;
    return repairModelJson(settings, messages, content, error);
  }
}

function buildChatPayload(settings, messages, responseFormat, temperature) {
  const payload = {
    model: settings.model,
    messages,
    temperature
  };
  if (responseFormat) payload.response_format = responseFormat;
  return payload;
}

async function requestChatCompletion(settings, payload) {
  const response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(buildHttpErrorMessage(response.status, data.error?.message));
  }

  return normalizeModelContent(data.choices?.[0]?.message?.content);
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      return { error: { message: text || `HTTP ${response.status}` } };
    }
    throw new Error("模型接口返回了非 JSON HTTP 响应。请检查 Base URL 是否指向 OpenAI 兼容接口。");
  }
}

async function repairModelJson(settings, messages, rawText, originalError) {
  const repairMessages = [
    {
      role: "system",
      content: [
        "你是 JSON 格式修复器。",
        "把用户提供的模型回复改写成合法 JSON。",
        "只返回 JSON，不要返回 Markdown，不要使用代码块。",
        "JSON 结构必须是：{\"message\":\"中文回复\",\"clarifications\":[{\"question\":\"...\",\"options\":[\"...\"]}],\"cases\":[{\"id\":\"TC-001\",\"title\":\"...\",\"priority\":\"P0/P1/P2/P3\",\"type\":\"...\",\"precondition\":\"...\",\"steps\":\"...\",\"expected\":\"...\"}]}。",
        "如果原始回复是在追问需求，返回 cases 为空数组。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "原始用户需求：",
        lastUserContent(messages) || "未记录",
        "",
        "需要修复的模型回复：",
        rawText || originalError.rawText || "空回复"
      ].join("\n")
    }
  ];

  const jsonPayload = buildChatPayload(settings, repairMessages, { type: "json_object" }, 0);
  try {
    return parseModelJson(await requestChatCompletion(settings, jsonPayload));
  } catch (error) {
    if (!isResponseFormatUnsupported(error) && error.code !== "MODEL_JSON_PARSE_ERROR") {
      throw error;
    }
  }

  const plainPayload = buildChatPayload(settings, repairMessages, null, 0);
  try {
    return parseModelJson(await requestChatCompletion(settings, plainPayload));
  } catch (error) {
    return buildPlainTextFallback(error.rawText || rawText || originalError.rawText || "");
  }
}

function buildPlainTextFallback(text) {
  const message = normalizeModelContent(text).trim();
  if (!message) {
    throw new Error("模型没有返回可展示内容。请检查模型名称或接口兼容性。");
  }
  return {
    message,
    clarifications: buildClarificationsFromPlainText(message),
    cases: []
  };
}

function buildClarificationsFromPlainText(text) {
  const questions = text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.、)]）?)\s*/, "").trim())
    .filter((line) => /[?？]$/.test(line))
    .slice(0, 4);
  return questions.map((question) => ({
    question,
    options: ["是", "否", "不适用", "其它，我补充"]
  }));
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
        required: ["message", "clarifications", "cases"],
        properties: {
          message: { type: "string" },
          clarifications: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["question", "options"],
              properties: {
                question: { type: "string" },
                options: {
                  type: "array",
                  items: { type: "string" }
                }
              }
            }
          },
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
  const normalizedText = normalizeModelContent(text).trim();
  try {
    return JSON.parse(stripJsonFence(normalizedText));
  } catch {
    const candidates = extractJsonObjectCandidates(normalizedText);
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next candidate.
      }
    }
    if (!candidates.length) {
      throw modelJsonError("模型没有返回有效 JSON。", normalizedText);
    }
    throw modelJsonError("模型返回了 JSON 片段，但格式不完整。", normalizedText);
  }
}

function normalizeModelContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      return item?.text || item?.content || item?.input_text || "";
    }).filter(Boolean).join("\n");
  }
  return String(content);
}

function stripJsonFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObjectCandidates(text) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

function modelJsonError(message, rawText) {
  const error = new Error(message);
  error.code = "MODEL_JSON_PARSE_ERROR";
  error.rawText = rawText;
  return error;
}

function buildRepairError(error) {
  if (error.code === "MODEL_JSON_PARSE_ERROR") {
    return new Error("模型返回了非 JSON，自动修复后仍不是有效 JSON。请在设置中关闭严格 JSON Schema 输出，或更换更稳定支持 JSON 输出的模型。");
  }
  return error;
}

function isResponseFormatUnsupported(error) {
  return /json_schema|response_format|json_object|schema/i.test(error.message || "");
}

function lastUserContent(messages) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function buildHttpErrorMessage(status, detail) {
  const suffix = detail ? `：${detail}` : "";
  if (status === 401 || status === 403) return `认证失败${suffix}。请检查 API Key 是否有效。`;
  if (status === 404) return `接口不存在${suffix}。请检查 Base URL 是否应填写到 /v1。`;
  if (status === 429) return `请求被限流${suffix}。请稍后重试，或检查服务额度。`;
  if (status >= 500) return `模型服务异常${suffix}。请稍后重试或更换服务。`;
  if (detail && /json_schema|response_format|schema/i.test(detail)) {
    return `当前模型服务可能不支持严格 JSON Schema 输出${suffix}。请在设置中关闭严格 JSON Schema 输出后重试。`;
  }
  return detail || `HTTP ${status}`;
}

function renderErrorMessage(error) {
  const message = escapeHtml(error.message || "未知错误");
  return `
    <p>请求失败：${message}</p>
    <p>请检查 API Key、Base URL、模型名称和网络访问权限。使用 OpenAI 兼容服务时，如果报错和 schema、response_format 或 JSON 有关，请在设置中关闭严格 JSON Schema 输出。</p>
  `;
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

function normalizeClarifications(clarifications) {
  if (!Array.isArray(clarifications)) return [];
  return clarifications
    .map((item) => ({
      question: String(item.question || "").trim(),
      options: Array.isArray(item.options)
        ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 4)
        : []
    }))
    .filter((item) => item.question);
}

function renderClarifications(clarifications) {
  if (!clarifications.length) return "";
  const groups = clarifications.map((item, questionIndex) => {
    const options = item.options.length ? item.options : ["需要补充", "不适用", "其它，我补充"];
    const optionNodes = options.map((option) => {
      return `
        <label class="clarification-option">
          <input type="checkbox" value="${escapeHtml(option)}">
          <span>${escapeHtml(option)}</span>
        </label>
      `;
    }).join("");
    return `
      <div class="clarification-group" data-question="${escapeHtml(item.question)}">
        <div class="clarification-question">${questionIndex + 1}. ${escapeHtml(item.question)}</div>
        <div class="clarification-options">${optionNodes}</div>
        <textarea class="clarification-note" rows="2" placeholder="这个问题也可以直接补充真实规则。"></textarea>
      </div>
    `;
  }).join("");

  return `
    <div class="clarification-panel">
      ${groups}
      <label class="clarification-custom">
        <span>补充说明</span>
        <textarea rows="3" placeholder="也可以直接写真实规则、测试数据、页面反馈或其它约束。"></textarea>
      </label>
      <div class="message-tools">
        <button class="message-action" data-action="submit-clarifications" type="button">提交补充</button>
      </div>
    </div>
  `;
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
      <button class="message-action" data-action="export-xmind-md" type="button">XMind Markdown</button>
    </div>
  `;
}

function inspectCaseQuality(cases) {
  const issues = [];
  const titles = new Map();
  const vaguePatterns = [/验证.*正常/, /功能正常/, /符合预期/, /正确处理/, /^正常$/];

  cases.forEach((item, index) => {
    const label = item.id || `第 ${index + 1} 条`;
    ["title", "priority", "type", "precondition", "steps", "expected"].forEach((field) => {
      if (!String(item[field] || "").trim()) {
        issues.push(`${label} 缺少 ${caseFieldLabel(field)}。`);
      }
    });

    const titleKey = item.title.trim();
    if (titleKey) {
      titles.set(titleKey, (titles.get(titleKey) || 0) + 1);
    }

    if (item.steps.trim().length < 12) {
      issues.push(`${label} 的测试步骤过短，可能不可执行。`);
    }
    if (item.expected.trim().length < 8) {
      issues.push(`${label} 的预期结果过短，可能不可判断。`);
    }
    if (vaguePatterns.some((pattern) => pattern.test(item.expected))) {
      issues.push(`${label} 的预期结果偏模糊，建议写明页面反馈、状态或数据变化。`);
    }
  });

  titles.forEach((count, title) => {
    if (count > 1) {
      issues.push(`存在重复标题：${title}。`);
    }
  });

  return issues.slice(0, 8);
}

function renderQualityIssues(issues) {
  if (!issues.length) {
    return `<div class="quality-note ok">本地质量检查：未发现明显字段缺失、重复标题或模糊预期。</div>`;
  }
  return `
    <div class="quality-note warn">
      <strong>本地质量检查</strong>
      <ul>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
    </div>
  `;
}

function caseFieldLabel(field) {
  const labels = {
    title: "标题",
    priority: "优先级",
    type: "类型",
    precondition: "前置条件",
    steps: "测试步骤",
    expected: "预期结果"
  };
  return labels[field] || field;
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
    `- 需求摘要：${markdownInline(state.lastRequirement || firstUserMessage() || "未记录")}`,
    `- 生成时间：${new Date().toLocaleString()}`,
    `- 用例数量：${state.cases.length}`,
    "",
    "| 编号 | 标题 | 优先级 | 类型 | 前置条件 | 测试步骤 | 预期结果 |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];
  state.cases.forEach((item) => {
    lines.push([item.id, item.title, item.priority, item.type, item.precondition, item.steps, item.expected].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  });
  downloadFile("test-cases.md", lines.join("\n"), "text/markdown;charset=utf-8");
}

function exportXmindMarkdown() {
  const title = state.lastRequirement || firstUserMessage() || "测试用例";
  const lines = [
    `# ${markdownInline(title)}`,
    ""
  ];
  const groups = groupCasesByType(state.cases);
  groups.forEach(([type, cases]) => {
    lines.push(`## ${markdownInline(type || "未分类")}`);
    cases.forEach((item) => {
      lines.push(`### ${markdownInline(`${item.id} ${item.title}`)}`);
      lines.push(`- 优先级：${markdownInline(item.priority)}`);
      if (item.precondition) lines.push(`- 前置条件：${markdownInline(item.precondition)}`);
      lines.push(`- 测试步骤：${markdownInline(item.steps)}`);
      lines.push(`- 预期结果：${markdownInline(item.expected)}`);
    });
    lines.push("");
  });
  downloadFile("test-cases-xmind.md", lines.join("\n"), "text/markdown;charset=utf-8");
}

function groupCasesByType(cases) {
  const groups = new Map();
  cases.forEach((item) => {
    const type = item.type || "未分类";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(item);
  });
  return [...groups.entries()];
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
  const item = {
    sessionId: state.sessionId,
    messages: state.messages,
    cases: state.cases,
    lastRequirement: state.lastRequirement,
    createdAt: new Date().toISOString()
  };
  const history = await getStored(HISTORY_KEY, []);
  const nextHistory = history.filter((entry) => entry.sessionId !== state.sessionId);
  nextHistory.unshift(item);
  await setStored(HISTORY_KEY, nextHistory.slice(0, 20));
}

async function showHistory() {
  closeActionMenu();
  renderHistory(await getStored(HISTORY_KEY, []));
  showView("history");
}

function renderHistory(history) {
  if (!history.length) {
    els.historyList.innerHTML = `<p class="empty-note">暂无历史记录。发送需求后，会自动保存最近会话。</p>`;
    return;
  }
  els.historyList.innerHTML = history.slice(0, 5).map((item, index) => {
    const firstUser = item.messages.find((message) => message.role === "user")?.content || "未命名会话";
    const cases = item.cases || [];
    const caseText = cases.length ? `${cases.length} 条用例` : "尚未生成用例";
    return `
      <div class="case-card">
        <strong>${escapeHtml(firstUser.slice(0, 80))}</strong>
        <p>${new Date(item.createdAt).toLocaleString()}，${caseText}</p>
        <button data-action="reuse-history" data-index="${index}" type="button">打开</button>
      </div>
    `;
  }).join("");
}

async function reuseHistory(index) {
  const item = (await getStored(HISTORY_KEY, []))[index];
  if (!item) return;
  state.sessionId = item.sessionId || crypto.randomUUID();
  state.messages = item.messages || [];
  state.cases = item.cases || [];
  state.lastRequirement = item.lastRequirement || firstUserMessage();
  els.messages.innerHTML = "";
  state.messages.forEach((message) => addPlainMessage(message.role === "assistant" ? "ai" : "user", message.content));
  if (state.cases.length) {
    addMessage("ai", `<p>该会话最近生成的测试用例：</p>${renderCaseTable(state.cases)}${renderExportActions()}`);
  }
  showView("chat");
  setStatus("已打开历史", state.settings.apiKey ? "llm" : "");
}

function startNewSession() {
  state.sessionId = crypto.randomUUID();
  state.messages = [];
  state.cases = [];
  state.lastRequirement = "";
  els.messages.innerHTML = "";
  els.chatInput.value = "";
  closeActionMenu();
  showView("chat");
  setStatus(state.settings.apiKey ? "模型已连接" : "模型未配置", state.settings.apiKey ? "llm" : "");
  addPlainMessage("ai", "请发送需求文案。我会在信息不足时先追问，信息足够时生成结构化测试用例。");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function markdownInline(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function firstUserMessage() {
  return state.messages.find((message) => message.role === "user")?.content || "";
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
els.menuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleActionMenu();
});
els.settingsBtn.addEventListener("click", openSettingsPanel);
els.historyBtn.addEventListener("click", showHistory);
els.clearBtn.addEventListener("click", startNewSession);
els.chatInput.addEventListener("keydown", handleChatInputKeydown, true);
els.closeSettingsBtn.addEventListener("click", closeSettingsPanel);
els.closeHistoryBtn.addEventListener("click", () => showView("chat"));
els.saveSettingsBtn.addEventListener("click", saveSettingsFromPanel);
els.testSettingsBtn.addEventListener("click", testSettingsConnection);
els.deleteSettingsBtn.addEventListener("click", deleteSettingsConfig);
els.toggleKeyBtn.addEventListener("click", toggleKeyVisibility);

function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "open-options") openSettingsPanel();
  if (button.dataset.action === "export-xmind-md") exportXmindMarkdown();
  if (button.dataset.action === "submit-clarifications") submitClarifications(button);
  if (button.dataset.action === "reuse-history") reuseHistory(Number(button.dataset.index));
}

function submitClarifications(button) {
  const panel = button.closest(".clarification-panel");
  if (!panel) return;
  const modelLines = [];
  const visibleLines = [];
  const sourceMessage = panel.closest(".message");
  panel.querySelectorAll(".clarification-group").forEach((group, index) => {
    const question = group.dataset.question || "";
    const selected = [...group.querySelectorAll("input:checked")].map((input) => input.value);
    const note = group.querySelector(".clarification-note")?.value.trim();
    if (question && (selected.length || note)) {
      modelLines.push(`${index + 1}. ${question}`);
      if (selected.length) modelLines.push(`   选择：${selected.join("、")}`);
      if (note) modelLines.push(`   补充：${note}`);
      visibleLines.push([selected.join("、"), note].filter(Boolean).join("；"));
    }
  });
  const custom = panel.querySelector(".clarification-custom textarea")?.value.trim();
  if (custom) {
    modelLines.push(`补充说明：${custom}`);
    visibleLines.push(custom);
  }
  if (!modelLines.length) {
    setStatus("请先选择或补充");
    return;
  }
  button.disabled = true;
  panel.insertAdjacentHTML("beforebegin", renderClarificationSummary(visibleLines));
  panel.remove();
  const modelContent = [
    "用户已确认以下真实答案，请把这些内容视为当前需求的确定事实，不要再次要求用户在这些已确认项中二选一或确认同一问题。",
    modelLines.join("\n"),
    "",
    "请基于以上真实补充继续判断是否可以生成测试用例；只有仍缺少新的关键事实时，才继续追问。"
  ].join("\n");
  const visibleContent = `已补充信息：\n${visibleLines.map((line) => `- ${line}`).join("\n")}`;
  if (sourceMessage) sourceMessage.dataset.resolved = "true";
  sendChat(modelContent, visibleContent);
}

function renderClarificationSummary(lines) {
  return `
    <div class="clarification-summary">
      <strong>已提交补充</strong>
      <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    </div>
  `;
}

els.messages.addEventListener("click", handleActionClick);
els.historyList.addEventListener("click", handleActionClick);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".topbar-actions")) closeActionMenu();
});

startNewSession();
loadSettings();
