const SETTINGS_KEY = "ai-test-case-settings-v1";
const extensionApi = globalThis.chrome;

const els = {
  apiKey: document.querySelector("#apiKey"),
  baseUrl: document.querySelector("#baseUrl"),
  model: document.querySelector("#model"),
  strictSchema: document.querySelector("#strictSchema"),
  saveBtn: document.querySelector("#saveBtn"),
  testBtn: document.querySelector("#testBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  statusText: document.querySelector("#statusText")
};

const defaults = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  strictSchema: true
};

async function getSettings() {
  if (extensionApi?.storage) {
    return await new Promise((resolve) => {
      extensionApi.storage.local.get({ [SETTINGS_KEY]: defaults }, (result) => resolve(result[SETTINGS_KEY]));
    });
  }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

async function setSettings(settings) {
  if (extensionApi?.storage) {
    await extensionApi.storage.local.set({ [SETTINGS_KEY]: settings });
    return;
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function loadSettings() {
  const settings = await getSettings();
  els.apiKey.value = settings.apiKey || "";
  els.baseUrl.value = settings.baseUrl || defaults.baseUrl;
  els.model.value = settings.model || defaults.model;
  els.strictSchema.checked = settings.strictSchema !== false;
  setStatus(settings.apiKey ? "已加载本地配置" : "尚未配置 API Key");
}

function readForm() {
  return {
    apiKey: els.apiKey.value.trim(),
    baseUrl: (els.baseUrl.value.trim() || defaults.baseUrl).replace(/\/+$/, ""),
    model: els.model.value.trim() || defaults.model,
    strictSchema: els.strictSchema.checked
  };
}

function setStatus(text) {
  els.statusText.textContent = text;
}

async function save() {
  await setSettings(readForm());
  setStatus("已保存到浏览器本地");
}

async function clearKey() {
  const settings = readForm();
  settings.apiKey = "";
  await setSettings(settings);
  els.apiKey.value = "";
  setStatus("已清除 API Key");
}

async function testConnection() {
  const settings = readForm();
  if (!settings.apiKey) {
    setStatus("请先填写 API Key");
    return;
  }
  setStatus("正在测试连接...");
  try {
    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: "请只回复 OK。" }],
        max_tokens: 16
      })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error?.message || `HTTP ${response.status}`);
    }
    setStatus("连接成功");
  } catch (error) {
    setStatus(`连接失败：${error.message}`);
  }
}

els.saveBtn.addEventListener("click", save);
els.clearBtn.addEventListener("click", clearKey);
els.testBtn.addEventListener("click", testConnection);
loadSettings();
