const http = require("http");

const clarification = {
  message: "还缺少登录方式、校验规则和成功判定，请先补充。",
  clarifications: [
    { question: "登录账号使用什么类型？", options: ["手机号", "邮箱", "用户名", "其它，我补充"] },
    { question: "登录成功后如何判定？", options: ["进入首页", "返回登录令牌", "展示用户信息", "其它，我补充"] }
  ],
  cases: []
};

const generated = {
  message: "已根据已确认规则生成 2 条可追溯测试用例。",
  clarifications: [],
  cases: [
    {
      id: "TC-001",
      requirementPoint: "手机号和正确密码登录成功后进入首页",
      title: "有效手机号和密码登录成功",
      priority: "P0",
      type: "正常流程",
      testMethod: "场景法",
      precondition: "账号已注册、未锁定，测试人员持有正确密码。",
      steps: "1. 打开登录页；2. 输入有效的 11 位手机号和正确密码；3. 点击登录。",
      expected: "登录请求成功，页面进入首页并展示当前账号的用户信息。",
      risk: "合法用户无法进入核心业务首页",
      source: "用户补充"
    },
    {
      id: "TC-002",
      requirementPoint: "手机号必须为中国大陆 11 位手机号",
      title: "手机号少于 11 位时拒绝登录",
      priority: "P1",
      type: "边界值",
      testMethod: "边界值分析",
      precondition: "用户位于登录页。",
      steps: "1. 输入 10 位数字手机号；2. 输入任意符合长度要求的密码；3. 点击登录。",
      expected: "页面阻止登录并明确提示手机号格式错误，不创建登录会话。",
      risk: "无效账号进入认证流程并增加接口负载",
      source: "用户补充 + 测试设计推导"
    }
  ]
};

const review = {
  score: 82,
  summary: "现有用例可执行且追溯清晰，但没有覆盖用户已确认的密码长度边界。",
  findings: [
    {
      severity: "medium",
      caseIds: ["TC-002"],
      problem: "只覆盖手机号长度下边界，未覆盖超过 11 位的输入。",
      suggestion: "增加 12 位手机号输入用例，确认前端和接口均拒绝。"
    }
  ],
  missingCoverage: ["密码长度为 8 位和 20 位时允许提交", "密码少于 8 位或超过 20 位时拒绝提交"]
};

const server = http.createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
  response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.url !== "/v1/chat/completions") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "not found" } }));
    return;
  }
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const payload = JSON.parse(body || "{}");
    const messages = payload.messages || [];
    const system = String(messages[0]?.content || "");
    const lastUser = [...messages].reverse().find((item) => item.role === "user")?.content || "";
    let content = "OK";
    if (system.includes("独立于用例生成者")) {
      content = JSON.stringify(review);
    } else if (system.includes("资深测试专家")) {
      content = JSON.stringify(lastUser.includes("帮我设计登录测试用例") ? clarification : generated);
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

server.listen(18080, "127.0.0.1", () => {
  console.log("Mock OpenAI listening on http://127.0.0.1:18080/v1");
});
