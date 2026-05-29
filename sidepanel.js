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
  settings: { ...defaults }
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
    setStatus("Configured", "llm");
    addPlainMessage("ai", `Loaded local model settings: ${state.settings.model}`);
  } else {
    setStatus("Not configured");
    addMessage("ai", `<p>Please configure your API key first. The key is stored only in your browser local storage.</p><div class="message-tools"><button class="message-action" data-action="open-options" type="button">Open settings</button></div>`);
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
  const content = els.chatInput.value.trim();
  if (!content) {
    setStatus("Input required");
    return;
  }

  state.settings = { ...defaults, ...(await getStored(SETTINGS_KEY, defaults)) };
  if (!state.settings.apiKey) {
    addMessage("ai", `<p>No API key is configured. Open settings and enter your model service details.</p><div class="message-tools"><button class="message-action" data-action="open-options" type="button">Open settings</button></div>`);
    setStatus("Not configured");
    return;
  }

  els.chatInput.value = "";
  state.messages.push({ role: "user", content });
  addPlainMessage("user", content);
  setLoading(true);
  const loadingNode = addMessage("ai", "<p>Thinking...</p>", "pending");

  try {
    const result = await callModel(state.settings, state.messages);
    loadingNode.remove();

    const assistantText = result.message || "Done.";
    state.messages.push({ role: "assistant", content: assistantText });

    if (Array.isArray(result.cases) && result.cases.length) {
      state.cases = normalizeCases(result.cases);
      addMessage("ai", `
        <p>${escapeHtml(assistantText)}</p>
        <p class="mode-note">Source: local user-configured model ${escapeHtml(state.settings.model)}</p>
        ${renderCaseTable(state.cases)}
        ${renderExportActions()}
      `);
      await saveHistory();
    } else {
      addMessage("ai", `<p>${escapeHtml(assistantText)}</p><p class="mode-note">Source: local user-configured model ${escapeHtml(state.settings.model)}</p>`);
    }
    setStatus("Replied", "llm");
  } catch (error) {
    loadingNode.remove();
    addMessage("ai", `<p>Request failed: ${escapeHtml(error.message)}</p><p>Check API key, Base URL, model name, and extension host permissions.</p>`);
    setStatus("Failed");
  } finally {
    setLoading(false);
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
  return [
    "You are a senior QA test design assistant.",
    "Help the user turn requirement text into executable test cases through a Codex-like chat.",
    "Reply in Chinese unless the user explicitly asks for another language.",
    "If the requirement is unclear, ask the 2-4 most important clarification questions and return an empty cases array.",
    "If the requirement is clear enough, generate structured test cases.",
    "Cover main flow, input validation, exception flow, boundary values, state changes, permissions/security, data consistency, and API errors where applicable.",
    "Use black-box test design techniques: equivalence partitioning, boundary value analysis, decision tables, state transition testing, scenario testing, and error guessing.",
    "Every case must be executable. Steps and expected results must be specific. Avoid vague text such as 'verify it works'.",
    "Do not create duplicate cases just to increase count.",
    "Priority rule: P0 for critical flows, money, login, permissions, and data corruption risk; P1 for important exceptions and boundaries; P2 for lower-risk compatibility or copy details.",
    "Return JSON only. Do not return Markdown or code fences.",
    "Shape: {\"message\":\"Chinese reply for the user\",\"cases\":[{\"id\":\"TC-001\",\"title\":\"...\",\"priority\":\"P0/P1/P2\",\"type\":\"normal/input validation/exception/boundary/state/security/API/compatibility\",\"precondition\":\"...\",\"steps\":\"...\",\"expected\":\"...\"}]}"
  ].join("\n");
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
    if (!match) throw new Error("The model did not return valid JSON.");
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
    title: item.title || "Untitled test case",
    priority: item.priority || "P1",
    type: item.type || "functional",
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
            <th>ID</th>
            <th>Title</th>
            <th>Priority</th>
            <th>Type</th>
            <th>Precondition</th>
            <th>Steps</th>
            <th>Expected</th>
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
  const header = ["ID", "Title", "Priority", "Type", "Precondition", "Steps", "Expected"];
  const rows = state.cases.map((item) => [item.id, item.title, item.priority, item.type, item.precondition, item.steps, item.expected]);
  downloadFile("test-cases.csv", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
}

function exportJson() {
  downloadFile("test-cases.json", JSON.stringify({ messages: state.messages, cases: state.cases }, null, 2), "application/json;charset=utf-8");
}

function exportMarkdown() {
  const lines = [
    "# Test Cases",
    "",
    "| ID | Title | Priority | Type | Precondition | Steps | Expected |",
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
    addPlainMessage("ai", "No history yet. A generated test case session will be saved automatically.");
    return;
  }
  const cards = history.slice(0, 5).map((item, index) => {
    const firstUser = item.messages.find((message) => message.role === "user")?.content || "Untitled session";
    return `
      <div class="case-card">
        <strong>${escapeHtml(firstUser.slice(0, 80))}</strong>
        <p>${new Date(item.createdAt).toLocaleString()}, ${item.cases.length} cases</p>
        <button data-action="reuse-history" data-index="${index}" type="button">Open</button>
      </div>
    `;
  }).join("");
  addMessage("ai", `<p>Recent sessions:</p><div class="case-list">${cards}</div>`);
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
    addMessage("ai", `<p>Recent generated cases for this session.</p>${renderCaseTable(state.cases)}${renderExportActions()}`);
  }
  setStatus("History opened", state.settings.apiKey ? "llm" : "");
}

function startNewSession() {
  state.sessionId = crypto.randomUUID();
  state.messages = [];
  state.cases = [];
  els.messages.innerHTML = "";
  els.chatInput.value = "";
  setStatus(state.settings.apiKey ? "Configured" : "Not configured", state.settings.apiKey ? "llm" : "");
  addPlainMessage("ai", "Send me a requirement. I will ask clarifying questions when needed, then generate structured test cases.");
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
document.addEventListener("keydown", (event) => {
  if (event.target !== els.chatInput) return;
  handleChatInputKeydown(event);
}, true);

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
