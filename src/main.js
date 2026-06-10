import * as THREE from "./vendor/three.module.js";

const DEFAULT_DREAM = `旧医院的走廊，没有窗，墙上贴着褪色的海报。
我往前走，尽头像地铁站，地面有很浅的水。
左边有一座小神龛，里面的灯一闪一闪。
走到售票机旁边会突然停电，有个影子站在远处。
一个穿白衣的人说：你不是第一次回来。`;

const app = document.querySelector("#app");
app.innerHTML = `
  <main class="shell mode-compose" id="shell">
    <div id="three-root"></div>
    <section class="hud">
      <div class="topbar">
        <div class="title-block">
          <p class="eyebrow">Dream Walkback / 梦境回放原型</p>
          <h1 id="scene-title">旧医院尽头的地铁站</h1>
          <div class="status" id="status">点击开始后，用第一视角走到发光的位置。</div>
        </div>
        <div class="controls">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span>
          <span><kbd>鼠标</kbd> 看向</span>
          <span><kbd>E</kbd> 交互</span>
          <span><kbd>Shift</kbd> 慢走</span>
          <span><kbd>Esc</kbd> 释放鼠标</span>
        </div>
      </div>

      <div class="center-reticle" aria-hidden="true"></div>

      <form class="composer" id="composer">
        <label for="dream-input">
          梦的碎片
          <span class="hint">先解析分镜，再生成场景</span>
        </label>
        <textarea id="dream-input" spellcheck="false"></textarea>
        <div class="button-row">
          <button class="primary" type="submit">解析梦境</button>
          <button type="button" id="generate-direct">直接生成</button>
        </div>
      </form>

      <section class="draft-panel hidden" id="draft-panel">
        <div class="draft-header">
          <div>
            <p class="eyebrow">Dream Breakdown</p>
            <h2>分镜确认</h2>
          </div>
          <button type="button" id="close-draft" aria-label="关闭分镜">×</button>
        </div>
        <label class="story-label" for="story-output">润色后的梦境文本</label>
        <textarea id="story-output" class="story-output" spellcheck="false"></textarea>
        <div class="storyboard" id="storyboard"></div>
        <div class="button-row">
          <button class="primary" type="button" id="confirm-dream">确认并生成可回放梦境</button>
          <button type="button" id="refresh-draft">从原文重新解析</button>
          <button type="button" id="save-dream">保存 .redream</button>
          <button type="button" id="load-dream">导入 .redream</button>
        </div>
        <input class="file-input" id="dream-file" type="file" accept=".redream,application/json" />
      </section>

      <div class="play-dock" id="play-dock">
        <button type="button" id="open-compose">文本</button>
        <button type="button" id="open-draft">分镜</button>
        <button type="button" id="toggle-log" aria-label="打开记录">＋</button>
        <div class="log-popover hidden" id="log-popover">
          <div class="event-log" id="event-log">
            <strong>触发记录</strong>
            <div class="entry">还没有触发。靠近发光物体试试。</div>
          </div>
          <button type="button" id="replay">重放触发</button>
        </div>
      </div>

      <div class="interaction-prompt hidden" id="interaction-prompt">按 E 触发</div>

      <div class="dialogue hidden" id="dialogue">
        <div class="speaker" id="speaker">NPC</div>
        <div class="line" id="line"></div>
      </div>

      <div class="blackout" id="blackout"></div>
      <div class="vignette"></div>
    </section>
  </main>
`;

const shell = document.querySelector("#shell");
const input = document.querySelector("#dream-input");
const form = document.querySelector("#composer");
const statusEl = document.querySelector("#status");
const titleEl = document.querySelector("#scene-title");
const dialogue = document.querySelector("#dialogue");
const speaker = document.querySelector("#speaker");
const line = document.querySelector("#line");
const blackout = document.querySelector("#blackout");
const eventLog = document.querySelector("#event-log");
const replayButton = document.querySelector("#replay");
const directGenerateButton = document.querySelector("#generate-direct");
const draftPanel = document.querySelector("#draft-panel");
const storyOutput = document.querySelector("#story-output");
const storyboard = document.querySelector("#storyboard");
const confirmDreamButton = document.querySelector("#confirm-dream");
const refreshDraftButton = document.querySelector("#refresh-draft");
const closeDraftButton = document.querySelector("#close-draft");
const interactionPrompt = document.querySelector("#interaction-prompt");
const saveDreamButton = document.querySelector("#save-dream");
const loadDreamButton = document.querySelector("#load-dream");
const dreamFileInput = document.querySelector("#dream-file");
const openComposeButton = document.querySelector("#open-compose");
const openDraftButton = document.querySelector("#open-draft");
const toggleLogButton = document.querySelector("#toggle-log");
const logPopover = document.querySelector("#log-popover");

input.value = DEFAULT_DREAM;

function setMode(mode) {
  shell.classList.remove("mode-compose", "mode-draft", "mode-play");
  shell.classList.add(`mode-${mode}`);
  logPopover.classList.add("hidden");
  if (mode !== "play" && document.pointerLockElement === renderer?.domElement) {
    document.exitPointerLock();
  }
  if (mode === "compose") {
    window.setTimeout(() => input.focus(), 0);
  }
}

function isEditingText(target = document.activeElement) {
  return target?.matches?.("input, textarea, select, [contenteditable='true']");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060807);
scene.fog = new THREE.FogExp2(0x060807, 0.045);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 1.68, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector("#three-root").appendChild(renderer.domElement);

const world = new THREE.Group();
scene.add(world);

const clock = new THREE.Clock();
const keys = new Set();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const yaw = new THREE.Object3D();
const pitch = new THREE.Object3D();
yaw.add(pitch);
pitch.add(camera);
scene.add(yaw);
yaw.position.copy(camera.position);
camera.position.set(0, 0, 0);

let yawAngle = 0;
let pitchAngle = 0;
let dreamModel = null;
let triggerMeshes = [];
let activeDialogueTimer = 0;
let blackoutTimer = 0;
let ghost = null;
let eventCount = 0;
let currentDraft = null;
let pendingInteraction = null;
let interactPressed = false;
let propLabels = [];
let lastParsedRaw = "";

const palette = {
  concrete: new THREE.MeshStandardMaterial({ color: 0x77756b, roughness: 0.92, metalness: 0.05 }),
  darkConcrete: new THREE.MeshStandardMaterial({ color: 0x2a2e2b, roughness: 0.95 }),
  water: new THREE.MeshPhysicalMaterial({
    color: 0x35535c,
    roughness: 0.22,
    metalness: 0,
    transmission: 0.18,
    transparent: true,
    opacity: 0.5,
  }),
  amber: new THREE.MeshStandardMaterial({ color: 0xd6a75a, roughness: 0.35, emissive: 0x3a2609 }),
  greenGlow: new THREE.MeshStandardMaterial({ color: 0x8bd99e, emissive: 0x42784e, roughness: 0.5 }),
  redGlow: new THREE.MeshStandardMaterial({ color: 0xe797a5, emissive: 0x8d2636, roughness: 0.35 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.85 }),
  shadow: new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.6 }),
};

const LOCATION_WORDS = [
  "门口",
  "电梯",
  "走廊",
  "房间",
  "医院",
  "病房",
  "地铁",
  "站台",
  "售票机",
  "楼梯",
  "学校",
  "教室",
  "家",
  "客厅",
  "商场",
  "街",
  "桥",
  "海",
  "神龛",
  "庙",
  "镜子",
  "地下室",
];

const PERSON_WORDS = ["女生", "男生", "女人", "男人", "小孩", "妈妈", "爸爸", "朋友", "老师", "护士", "白衣人", "影子", "鬼", "陌生人", "主人公"];

function compactText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?])|\n+/)
    .map((part) => compactText(part))
    .filter(Boolean);
}

function splitIntoSceneTexts(text) {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return [compactText(text)];

  const scenes = [];
  let current = [];
  const hardShift = /然后|后来|接着|突然|之后|走到|来到|到了|进入|停电|灯灭|触发|醒来|看见|遇到|发现|左边|右边|旁边|出现|说|有个|一个/;

  for (const sentence of sentences) {
    if (current.length && hardShift.test(sentence)) {
      scenes.push(current.join(" "));
      current = [];
    }
    current.push(sentence);
    if (current.join("").length > 95) {
      scenes.push(current.join(" "));
      current = [];
    }
  }

  if (current.length) scenes.push(current.join(" "));
  return scenes.slice(0, 6);
}

function pickMatches(text, words) {
  return words.filter((word) => text.includes(word));
}

function inferLocation(text, index) {
  const matches = pickMatches(text, LOCATION_WORDS);
  if (matches.length) return [...new Set(matches)].slice(0, 3).join(" / ");
  return index === 0 ? "梦的入口" : `第 ${index + 1} 个梦境区域`;
}

function inferCharacters(text) {
  const matches = pickMatches(text, PERSON_WORDS);
  if (/我|自己|主人公/.test(text)) matches.unshift("主人公");
  return [...new Set(matches)].slice(0, 4).join("、") || "主人公";
}

function inferMood(text) {
  if (/开心|高兴|放松|温暖|安心/.test(text)) return "高兴的";
  if (/害怕|恐怖|鬼|黑影|压抑|窒息|追|逃/.test(text)) return "压抑、紧张";
  if (/神圣|庙|神龛|祭坛|光|圣/.test(text)) return "神圣又不安";
  if (/水|雨|潮湿|海|淹/.test(text)) return "潮湿、迟滞";
  if (/黑|停电|灯灭|夜/.test(text)) return "昏暗、悬着";
  return "模糊、低压";
}

function inferTrigger(text, location) {
  const talkTarget = text.match(/(?:和|跟|对)([^，。！？\s]{1,8})(?:说话|对话|讲话)/);
  if (talkTarget) return `靠近${talkTarget[1]}并按 E 对话`;
  if (/按|点击|打开|关上|拿起|触碰/.test(text)) return "靠近关键物体并按 E 交互";
  if (/看|盯|注视/.test(text)) return "看向关键物体";
  if (/停电|灯灭|断电/.test(text)) return `走到${location}后停电`;
  return `走到${location}`;
}

function inferTriggerType(trigger, text) {
  if (/对话|说话|按 E|交互|点击|打开|拿起|触碰/.test(`${trigger} ${text}`)) return "interaction";
  if (/看向|注视|盯/.test(`${trigger} ${text}`)) return "gaze";
  return "location";
}

function inferEvent(text, location) {
  const trimmed = compactText(text).replace(/[。！？!?]$/, "");
  if (trimmed.length > 8) return trimmed.slice(0, 90);
  return `主人公来到${location}，梦境开始改变`;
}

function inferDialogue(text) {
  const quoteMatch = text.match(/(?:说|说道|告诉我|广播)[:：]?\s*["“]?([^"”。，\n]{2,36})/);
  if (quoteMatch) return quoteMatch[1].trim();
  if (/停电|灯灭|断电/.test(text)) return "请留在原地。请不要回头。";
  if (/鬼|影子|黑影/.test(text)) return "你不是第一次回来。";
  if (/电梯/.test(text)) return "电梯门开着，但里面没有楼层。";
  return "这里像是在等你把它想起来。";
}

function inferEnvironment(text) {
  if (/宫殿|王国|骑士|水池|城堡|花园/.test(text)) return "palace";
  if (/卧室|床|躺|枕头|被子|手机/.test(text)) return "bedroom";
  if (/电梯|公寓|楼道/.test(text)) return "elevator";
  if (/学校|教室|讲台|老师|卷子|课桌/.test(text)) return "classroom";
  if (/地铁|站台|列车|售票|隧道/.test(text)) return "station";
  return "corridor";
}

function createDreamDraft(text) {
  const source = compactText(text || DEFAULT_DREAM);
  const sceneTexts = splitIntoSceneTexts(source);
  const scenes = sceneTexts.map((sceneText, index) => {
    const location = inferLocation(sceneText, index);
    const trigger = inferTrigger(sceneText, location);
    return {
      id: `scene-${index + 1}`,
      title: `场景 ${index + 1}：${location}`,
      location,
      characters: inferCharacters(sceneText),
      event: inferEvent(sceneText, location),
      mood: inferMood(sceneText),
      trigger,
      triggerType: inferTriggerType(trigger, sceneText),
      dialogue: inferDialogue(sceneText),
      source: sceneText,
    };
  });

  return {
    title: scenes[0]?.location ? `${scenes[0].location}的梦` : "未命名梦境",
    raw: source,
    story: polishDreamStory(scenes),
    scenes,
  };
}

function polishDreamStory(scenes) {
  return scenes
    .map((scene, index) => {
      const lead = index === 0 ? "梦一开始" : index === scenes.length - 1 ? "到最后" : "后来";
      return `${lead}，我在${scene.location}。这里的气氛是${scene.mood}，${scene.event}。${scene.characters.replace(/、/g, "和")}像是早就被安排在这里，只有我还不确定自己为什么会回来。触发点藏在“${scene.trigger}”这一刻：当它发生时，场景的秩序会突然松动，梦里的声音说：“${scene.dialogue}”`;
    })
    .join("\n\n");
}

function renderDraft(draft) {
  currentDraft = draft;
  lastParsedRaw = draft.raw || input.value.trim() || DEFAULT_DREAM;
  storyOutput.value = draft.story;
  storyboard.innerHTML = draft.scenes
    .map(
      (scene, index) => `
        <article class="scene-card" data-index="${index}">
          <div class="scene-card-head">
            <strong>场景 ${index + 1}</strong>
            <span>${scene.triggerType === "interaction" ? "交互触发" : scene.triggerType === "gaze" ? "注视触发" : "位置触发"}</span>
          </div>
          <label>地点<input data-field="location" value="${escapeAttribute(scene.location)}" /></label>
          <label>人物<input data-field="characters" value="${escapeAttribute(scene.characters)}" /></label>
          <label>事件<textarea data-field="event">${escapeHtml(scene.event)}</textarea></label>
          <label>情绪<input data-field="mood" value="${escapeAttribute(scene.mood)}" /></label>
          <label>触发点<input data-field="trigger" value="${escapeAttribute(scene.trigger)}" /></label>
          <label>触发方式
            <select data-field="triggerType">
              <option value="location" ${scene.triggerType === "location" ? "selected" : ""}>走到地点自动触发</option>
              <option value="interaction" ${scene.triggerType === "interaction" ? "selected" : ""}>靠近后按 E 交互</option>
              <option value="gaze" ${scene.triggerType === "gaze" ? "selected" : ""}>看向物体触发</option>
            </select>
          </label>
          <label>对白<input data-field="dialogue" value="${escapeAttribute(scene.dialogue)}" /></label>
        </article>
      `,
    )
    .join("");
  draftPanel.classList.remove("hidden");
  setMode("draft");
}

function updateSceneBadges() {
  [...storyboard.querySelectorAll(".scene-card")].forEach((card) => {
    const type = card.querySelector('[data-field="triggerType"]')?.value || "location";
    const badge = card.querySelector(".scene-card-head span");
    if (!badge) return;
    badge.textContent = type === "interaction" ? "交互触发" : type === "gaze" ? "注视触发" : "位置触发";
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function readDraftFromPanel() {
  const scenes = [...storyboard.querySelectorAll(".scene-card")].map((card, index) => {
    const read = (field) => card.querySelector(`[data-field="${field}"]`)?.value.trim() || "";
    return {
      id: currentDraft?.scenes[index]?.id || `scene-${index + 1}`,
      title: `场景 ${index + 1}：${read("location") || "未命名地点"}`,
      location: read("location") || "未命名地点",
      characters: read("characters") || "主人公",
      event: read("event") || "梦境发生了变化",
      mood: read("mood") || "模糊",
      trigger: read("trigger") || "走到这里",
      triggerType: read("triggerType") || "location",
      dialogue: read("dialogue") || "这里像是在等你回来。",
      source: currentDraft?.scenes[index]?.source || "",
    };
  });

  return {
    title: scenes[0]?.location ? `${scenes[0].location}的梦` : "未命名梦境",
    raw: input.value.trim() || DEFAULT_DREAM,
    story: storyOutput.value.trim() || polishDreamStory(scenes),
    scenes,
  };
}

function syncDraftFromPanel({ regenerateStory = false } = {}) {
  if (draftPanel.classList.contains("hidden") || !storyboard.children.length) return currentDraft;
  const draft = readDraftFromPanel();
  if (regenerateStory) {
    draft.story = polishDreamStory(draft.scenes);
    storyOutput.value = draft.story;
  }
  currentDraft = draft;
  lastParsedRaw = draft.raw;
  updateSceneBadges();
  return draft;
}

function extractQuotedDialogue(text) {
  const matches = [...String(text).matchAll(/[“"]([^”"]{1,120})[”"]/g)].map((match) => match[1].trim());
  return matches.at(-1) || "";
}

function syncPanelFromStory() {
  if (draftPanel.classList.contains("hidden") || !storyboard.children.length) return currentDraft;
  const paragraphs = storyOutput.value
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const cards = [...storyboard.querySelectorAll(".scene-card")];

  cards.forEach((card, index) => {
    const paragraph = paragraphs[index] || (cards.length === 1 ? storyOutput.value : "");
    const dialogue = extractQuotedDialogue(paragraph);
    const dialogueInput = card.querySelector('[data-field="dialogue"]');
    if (dialogue && dialogueInput) dialogueInput.value = dialogue;
  });

  return syncDraftFromPanel();
}

function getEditableDraft() {
  if (!draftPanel.classList.contains("hidden") && storyboard.children.length) {
    return readDraftFromPanel();
  }
  return currentDraft || createDreamDraft(input.value.trim() || DEFAULT_DREAM);
}

function saveDreamFile() {
  const draft = getEditableDraft();
  const payload = {
    version: 1,
    kind: "redream",
    savedAt: new Date().toISOString(),
    draft,
  };
  const safeName = (draft.title || "redream").replace(/[\\/:*?"<>|]/g, "").slice(0, 36) || "redream";
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.redream`;
  link.click();
  URL.revokeObjectURL(url);
  writeLog("梦境文件已保存。");
}

function loadDreamFile(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      const draft = payload.draft || payload;
      if (!draft?.scenes?.length) throw new Error("missing scenes");
      currentDraft = draft;
      input.value = draft.raw || input.value;
      renderDraft(draft);
      writeLog("已导入梦境文件，可修改后重新生成。");
    } catch {
      writeLog("导入失败：文件不是有效的 .redream。");
    }
  });
  reader.readAsText(file);
}

function buildDreamModel(source) {
  if (source?.scenes) {
    const combined = [source.raw, source.story, ...source.scenes.flatMap((scene) => [scene.location, scene.characters, scene.event, scene.mood, scene.trigger])].join(" ");
    const features = {
      hasHospital: /医院|病房|走廊|白色|护士/.test(combined),
      hasTrain: /地铁|车站|站台|售票|列车|隧道/.test(combined),
      hasWater: /水|淹|潮湿|雨|海/.test(combined),
      hasShrine: /神|庙|神龛|祭坛|香|圣|寺/.test(combined),
      hasGhost: /鬼|影子|黑影|怪物|死人|灵/.test(combined),
      hasBlackout: /停电|黑|灯灭|断电|熄灭/.test(combined),
    };
    return {
      title: source.title,
      mood: source.scenes.map((scene) => scene.mood).filter(Boolean).slice(0, 2).join("、") || "梦境化",
      features,
      environment: inferEnvironment(combined),
      story: source.story,
      events: source.scenes.map((scene, index) => ({
        id: scene.id,
        label: scene.trigger || scene.location,
        position: new THREE.Vector3(index % 2 === 0 ? -4.8 : 4.8, 1, -7 - index * 8.5),
        color: [0xd6b36b, 0x7fc5d8, 0xd58b9b, 0x89d6a3, 0xc7a2df, 0xe0c46f][index % 6],
        speaker: scene.characters.split(/[、,，/]/).find(Boolean) || "梦里的人",
        line: scene.dialogue,
        blackout: /停电|灯灭|断电|黑/.test(`${scene.event} ${scene.trigger}`),
        ghost: /鬼|影子|黑影|陌生人/.test(`${scene.characters} ${scene.event}`),
        triggerType: scene.triggerType,
        scene,
      })),
    };
  }

  const text = source;
  const hasHospital = /医院|病房|走廊|白色|护士/.test(text);
  const hasTrain = /地铁|车站|站台|售票|列车|隧道/.test(text);
  const hasWater = /水|淹|潮湿|雨|海/.test(text);
  const hasShrine = /神|庙|神龛|祭坛|香|圣|寺/.test(text);
  const hasGhost = /鬼|影子|黑影|怪物|死人|灵/.test(text);
  const hasBlackout = /停电|黑|灯灭|断电|熄灭/.test(text);
  const quoteMatch = text.match(/说[:：]\s*([^。\n]+)/);

  return {
    title: hasHospital && hasTrain ? "旧医院尽头的地铁站" : hasTrain ? "无人站台" : hasHospital ? "没有窗的走廊" : "梦核房间",
    mood: hasShrine ? "神圣又压抑" : hasWater ? "潮湿、迟滞" : "安静、低压",
    features: { hasHospital, hasTrain, hasWater, hasShrine, hasGhost, hasBlackout },
    environment: inferEnvironment(text),
    events: [
      {
        id: "shrine",
        label: hasShrine ? "小神龛" : "异常的灯",
        position: new THREE.Vector3(-5.5, 1, -8),
        color: 0xd6b36b,
        speaker: "白衣人",
        line: hasShrine ? "灯在闪。它像是在等你承认这是真的。" : "这盏灯不该在这里。",
        triggerType: "location",
      },
      {
        id: "blackout",
        label: hasBlackout ? "停电点" : "售票机",
        position: new THREE.Vector3(4.8, 1, -17),
        color: 0x7fc5d8,
        speaker: "广播",
        line: hasBlackout ? "请留在原地。请不要回头。" : "下一班车已经取消。",
        blackout: hasBlackout,
        triggerType: "location",
      },
      {
        id: "ghost",
        label: hasGhost ? "远处的影子" : "不该出现的人",
        position: new THREE.Vector3(0, 1, -29),
        color: 0xd58b9b,
        speaker: hasGhost ? "影子" : "陌生人",
        line: quoteMatch ? quoteMatch[1].trim() : "你不是第一次回来。",
        ghost: true,
        triggerType: "location",
      },
    ],
  };
}

function clearWorld() {
  for (const child of [...world.children]) {
    child.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
    });
    world.remove(child);
  }
  triggerMeshes = [];
  ghost = null;
  propLabels = [];
}

function addBox({ size, position, material, cast = true, receive = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  world.add(mesh);
  return mesh;
}

function addCylinder({ radius = 0.5, height = 1, position, material, radialSegments = 24 }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, radialSegments), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);
  return mesh;
}

function recordProp(label) {
  propLabels.push(label);
  document.body.dataset.props = propLabels.join(",");
}

function addCharacterFigure(label, position, options = {}) {
  recordProp(label);
  const group = new THREE.Group();
  const color = options.shadow ? 0x080808 : options.feminine ? 0xd9d0c4 : 0xb8c2ba;
  const cloth = options.shadow ? palette.shadow : new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const accent = options.shadow ? palette.shadow : new THREE.MeshStandardMaterial({ color: options.feminine ? 0xefe7db : 0xa9c5ba, roughness: 0.74 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.05, 8, 16), cloth);
  body.position.y = 0.92;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), accent);
  head.position.y = 1.7;
  group.add(body, head);

  if (options.feminine || /女生|女人|长发/.test(label)) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 12), new THREE.MeshStandardMaterial({ color: 0x17120f, roughness: 0.9 }));
    hair.scale.set(1, 1.25, 0.9);
    hair.position.y = 1.64;
    hair.position.z = -0.03;
    group.add(hair);
  }

  group.position.set(...position);
  group.lookAt(0, group.position.y, 10);
  world.add(group);
  addTextPlane(label.slice(0, 12), [position[0], 2.45, position[2] + 0.05], options.shadow ? 0xd58b9b : 0xe9eadb);
  return group;
}

function addElevator(position) {
  recordProp("电梯");
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x313735, roughness: 0.58, metalness: 0.28 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x79807b, roughness: 0.42, metalness: 0.48 });
  addBox({ size: [2.8, 3.0, 0.22], position, material: frameMat });
  addBox({ size: [1.22, 2.58, 0.08], position: [position[0] - 0.63, position[1] - 0.04, position[2] + 0.16], material: doorMat });
  addBox({ size: [1.22, 2.58, 0.08], position: [position[0] + 0.63, position[1] - 0.04, position[2] + 0.16], material: doorMat });
  addBox({ size: [0.08, 2.5, 0.08], position: [position[0], position[1] - 0.04, position[2] + 0.22], material: palette.darkConcrete });
  addBox({ size: [0.34, 0.52, 0.08], position: [position[0] + 1.78, position[1] + 0.16, position[2] + 0.22], material: palette.greenGlow });
  addTextPlane("电梯", [position[0], position[1] + 1.88, position[2] + 0.35], 0x89d6a3);
}

function addBed(position) {
  recordProp("床");
  const bedMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.86 });
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xd9d8d0, roughness: 0.92 });
  addBox({ size: [2.7, 0.45, 1.45], position: [position[0], position[1] - 0.47, position[2]], material: bedMat });
  addBox({ size: [2.5, 0.18, 1.28], position: [position[0], position[1] - 0.14, position[2]], material: sheetMat });
  addBox({ size: [0.62, 0.16, 1.0], position: [position[0] - 0.82, position[1] + 0.06, position[2]], material: palette.paper });
  addTextPlane("床", [position[0], position[1] + 1.15, position[2] - 0.1], 0xe9eadb);
}

function addPhone(position) {
  recordProp("手机");
  const phoneMat = new THREE.MeshStandardMaterial({ color: 0x111414, roughness: 0.35, metalness: 0.2 });
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x161b22, emissive: 0x0b1824, roughness: 0.2 });
  addBox({ size: [0.46, 0.08, 0.76], position, material: phoneMat });
  addBox({ size: [0.38, 0.03, 0.62], position: [position[0], position[1] + 0.06, position[2]], material: screenMat });
  addTextPlane("手机打不开", [position[0], position[1] + 0.86, position[2]], 0x7fc5d8);
}

function addMirror(position) {
  recordProp("镜子");
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x28231f, roughness: 0.7 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8ea0a0, roughness: 0.18, metalness: 0.36, emissive: 0x091011 });
  addBox({ size: [1.45, 2.0, 0.16], position, material: frameMat });
  addBox({ size: [1.18, 1.72, 0.08], position: [position[0], position[1], position[2] + 0.08], material: glassMat });
  addTextPlane("镜子", [position[0], position[1] + 1.35, position[2] + 0.16], 0x7fc5d8);
}

function addSceneProps(event, index) {
  const sceneData = event.scene;
  if (!sceneData) return;

  const text = [sceneData.location, sceneData.characters, sceneData.event, sceneData.trigger, sceneData.dialogue].join(" ");
  const xSide = event.position.x < 0 ? -1 : 1;
  const baseZ = event.position.z;
  const wallX = xSide * 6.9;

  addTextPlane(sceneData.location.slice(0, 18), [event.position.x, 2.55, baseZ + 0.55], event.color);

  if (/电梯/.test(text)) {
    addElevator([wallX, 1.52, baseZ - 0.55]);
  }

  if (/床|躺|床上|被子|枕/.test(text)) {
    addBed([event.position.x * 0.72, 0.55, baseZ + 1.35]);
  }

  if (/女生|女人|长发/.test(text)) {
    addCharacterFigure("女生", [event.position.x * 0.72, 0, baseZ - 1.15], { feminine: true });
  }

  if (/男生|男人|老师|护士|白衣人|朋友|妈妈|爸爸/.test(text)) {
    const label = (text.match(/男生|男人|老师|护士|白衣人|朋友|妈妈|爸爸/) || ["梦里的人"])[0];
    addCharacterFigure(label, [event.position.x * 0.65, 0, baseZ - 1.0], { feminine: /妈妈|护士/.test(label) });
  }

  if (/鬼|黑影|影子|长发女/.test(text)) {
    addCharacterFigure(/长发女/.test(text) ? "长发黑影" : "黑影", [event.position.x * 0.3, 0, baseZ - 2.1], { shadow: true, feminine: /长发女/.test(text) });
  }

  if (/手机/.test(text)) {
    addPhone([event.position.x * 0.62, 0.82, baseZ + 0.72]);
  }

  if (/镜子|镜头/.test(text)) {
    addMirror([-wallX, 1.42, baseZ - 0.25]);
  }

  if (/门口|门/.test(text) && !/电梯/.test(text)) {
    recordProp("门");
    addBox({ size: [1.6, 2.55, 0.18], position: [wallX, 1.28, baseZ - 0.3], material: palette.amber });
    addTextPlane("门", [wallX, 2.6, baseZ - 0.08], 0xd6b36b);
  }

  if (/闪电|亮缝|亮|光/.test(text)) {
    recordProp("亮缝");
    const light = new THREE.PointLight(0x7fc5d8, 1.8, 7);
    light.position.set(event.position.x * 0.45, 2.15, baseZ + 0.9);
    world.add(light);
    addBox({ size: [0.08, 1.55, 0.08], position: [event.position.x * 0.45, 1.2, baseZ + 0.9], material: palette.greenGlow });
  }

  if (index > 0) {
    addBox({ size: [5.6, 0.04, 0.08], position: [0, 0.04, baseZ + 3.9], material: new THREE.MeshStandardMaterial({ color: event.color, emissive: event.color, transparent: true, opacity: 0.34 }) });
  }
}

function addMarker(event) {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.05, 40),
    new THREE.MeshStandardMaterial({
      color: event.color,
      emissive: event.color,
      transparent: true,
      opacity: 0.42,
    }),
  );
  base.position.copy(event.position);
  base.position.y = 0.035;
  world.add(base);

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 20, 16),
    new THREE.MeshStandardMaterial({ color: event.color, emissive: event.color, roughness: 0.3 }),
  );
  orb.position.copy(event.position);
  orb.position.y = 1.45;
  world.add(orb);

  triggerMeshes.push({ event, base, orb, triggered: false });
}

function addTextPlane(text, position, color = 0xe9eadb) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(10, 13, 12, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.font = "34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 18), canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), material);
  mesh.position.set(...position);
  mesh.rotation.y = Math.PI;
  world.add(mesh);
}

function applyAtmosphere(environment, features) {
  const settings = {
    palace: { background: 0x13201a, fog: 0.025, hemi: 0xe7d6a2 },
    bedroom: { background: 0x10100f, fog: 0.035, hemi: 0xc8b8a0 },
    classroom: { background: 0x101412, fog: 0.03, hemi: 0xcbd6ca },
    elevator: { background: 0x080b0d, fog: 0.04, hemi: 0xbfd2d3 },
    station: { background: 0x060807, fog: 0.045, hemi: 0xb8d3ca },
    corridor: { background: 0x070909, fog: 0.04, hemi: 0xb8d3ca },
  }[environment] || { background: 0x070909, fog: 0.04, hemi: 0xb8d3ca };

  scene.background = new THREE.Color(settings.background);
  scene.fog = new THREE.FogExp2(settings.background, features.hasBlackout ? settings.fog + 0.018 : settings.fog);
  return settings;
}

function addBaseSkeleton(environment) {
  const wallMat = environment === "palace" ? new THREE.MeshStandardMaterial({ color: 0x7f7359, roughness: 0.82 }) : palette.concrete;
  const floorMat = environment === "palace" ? new THREE.MeshStandardMaterial({ color: 0x4a4f3f, roughness: 0.72 }) : palette.darkConcrete;

  addBox({ size: [15, 0.22, 74], position: [0, -0.1, -14], material: floorMat, cast: false });

  if (environment === "palace") {
    addBox({ size: [22, 0.2, 48], position: [0, -0.02, -13], material: floorMat, cast: false });
    addBox({ size: [2.6, 0.08, 4.8], position: [0, 0.03, -7], material: palette.water, cast: false });
    for (let z = 8; z > -34; z -= 7) {
      addCylinder({ radius: 0.28, height: 4.6, position: [-8.2, 2.2, z], material: wallMat });
      addCylinder({ radius: 0.28, height: 4.6, position: [8.2, 2.2, z], material: wallMat });
      const light = new THREE.PointLight(0xd6b36b, 1.0, 11);
      light.position.set(0, 3.6, z);
      world.add(light);
    }
    addTextPlane("宫殿大厅", [0, 2.8, 7], 0xd6b36b);
    return;
  }

  if (environment === "bedroom") {
    addBox({ size: [13, 3.6, 0.24], position: [0, 1.75, -28], material: wallMat, cast: false });
    addBox({ size: [0.24, 3.6, 34], position: [-6.5, 1.75, -8], material: wallMat, cast: false });
    addBox({ size: [0.24, 3.6, 34], position: [6.5, 1.75, -8], material: wallMat, cast: false });
    addBox({ size: [13, 0.2, 34], position: [0, 3.55, -8], material: palette.darkConcrete, cast: false });
    const lamp = new THREE.PointLight(0xd6b36b, 1.2, 16);
    lamp.position.set(-2.5, 3.0, 3);
    world.add(lamp);
    addBed([1.8, 0.55, -5.8]);
    addTextPlane("卧室", [0, 2.5, 5], 0xd6b36b);
    return;
  }

  if (environment === "classroom") {
    addBox({ size: [16, 0.22, 44], position: [0, -0.1, -10], material: floorMat, cast: false });
    addBox({ size: [16, 3.8, 0.24], position: [0, 1.8, -28], material: wallMat, cast: false });
    addBox({ size: [0.24, 3.8, 44], position: [-8, 1.8, -10], material: wallMat, cast: false });
    addBox({ size: [0.24, 3.8, 44], position: [8, 1.8, -10], material: wallMat, cast: false });
    addBox({ size: [4.2, 0.82, 1.2], position: [0, 0.45, -21], material: palette.amber });
    addTextPlane("讲台", [0, 1.55, -20.4], 0xd6b36b);
    for (let z = 2; z > -16; z -= 5) {
      for (let x of [-4.4, 0, 4.4]) addBox({ size: [1.6, 0.64, 1.0], position: [x, 0.36, z], material: palette.paper });
    }
    const light = new THREE.PointLight(0xcbd6ca, 1.25, 18);
    light.position.set(0, 3.2, -4);
    world.add(light);
    return;
  }

  const isElevator = environment === "elevator";
  addBox({ size: [15, 0.26, 74], position: [0, 4.2, -14], material: palette.darkConcrete, cast: false });
  addBox({ size: [0.24, 4.5, 74], position: [-7.5, 2, -14], material: wallMat, cast: false });
  addBox({ size: [0.24, 4.5, 74], position: [7.5, 2, -14], material: wallMat, cast: false });

  for (let z = 8; z > -42; z -= 8) {
    addBox({ size: [0.16, 4, 0.16], position: [-5.8, 1.9, z], material: wallMat });
    addBox({ size: [0.16, 4, 0.16], position: [5.8, 1.9, z], material: wallMat });
    const lamp = new THREE.PointLight(z % 16 === 0 ? 0x89d6a3 : 0xd6b36b, isElevator ? 1.05 : 0.82, 9);
    lamp.position.set(0, 3.6, z);
    world.add(lamp);
    addBox({ size: [1.2, 0.08, 0.28], position: [0, 3.55, z], material: palette.greenGlow, cast: false });
  }

  if (isElevator) {
    addElevator([0, 1.52, 6.8]);
    addTextPlane("电梯间", [0, 2.8, 4.8], 0x7fc5d8);
  }
}

function buildWorld(source) {
  clearWorld();
  dreamModel = buildDreamModel(source);
  titleEl.textContent = dreamModel.title;
  statusEl.textContent = `${dreamModel.mood}。靠近发光位置会触发情节。`;
  document.body.dataset.environment = dreamModel.environment;

  const atmosphere = applyAtmosphere(dreamModel.environment, dreamModel.features);
  const ambient = new THREE.HemisphereLight(atmosphere.hemi, 0x0c0f0b, dreamModel.environment === "palace" ? 0.78 : 0.54);
  world.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xc9d7c0, 0.72);
  keyLight.position.set(-8, 11, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  world.add(keyLight);

  addBaseSkeleton(dreamModel.environment);

  if (dreamModel.features.hasHospital) {
    for (let i = 0; i < 8; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = 4 - i * 5.4;
      addBox({ size: [0.09, 2.2, 1.3], position: [side * 7.36, 1.25, z], material: palette.paper });
      addTextPlane("请保持安静", [side * 7.28, 1.8, z], 0xd8d0b8);
    }
  }

  if (dreamModel.features.hasTrain) {
    addBox({ size: [10.8, 0.36, 0.9], position: [0, 0.1, -24], material: palette.concrete });
    addBox({ size: [2.2, 2.4, 0.32], position: [4.7, 1.3, -17], material: palette.greenGlow });
    addTextPlane("末班车", [4.64, 2.35, -16.8], 0x89d6a3);
    for (let x = -4; x <= 4; x += 2) {
      addBox({ size: [0.18, 0.1, 20], position: [x, 0.05, -31], material: palette.amber });
    }
  }

  if (dreamModel.features.hasWater) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(14.6, 42), palette.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, -14);
    world.add(water);
  }

  if (dreamModel.features.hasShrine) {
    addBox({ size: [1.5, 1.8, 0.4], position: [-7.05, 1.05, -8], material: palette.amber });
    addBox({ size: [0.9, 0.12, 0.78], position: [-6.7, 2.05, -8], material: palette.redGlow });
    const shrineLight = new THREE.PointLight(0xd6b36b, 2.2, 8);
    shrineLight.position.set(-5.7, 1.65, -8);
    world.add(shrineLight);
  }

  const ghostMaterial = palette.shadow.clone();
  ghost = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.35, 8, 16), ghostMaterial);
  body.position.y = 1.04;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), ghostMaterial);
  head.position.y = 2.02;
  ghost.add(body, head);
  ghost.position.set(0, 0, -31);
  ghost.visible = false;
  world.add(ghost);

  dreamModel.events.forEach((event, index) => {
    addSceneProps(event, index);
    addMarker(event);
  });
  resetPlayer();
  writeLog("新的梦境已经生成。");
}

function resetPlayer() {
  yaw.position.set(0, 1.68, 10);
  eventCount = 0;
  yawAngle = 0;
  pitchAngle = 0;
  yaw.rotation.y = yawAngle;
  pitch.rotation.x = pitchAngle;
  velocity.set(0, 0, 0);
  triggerMeshes.forEach((item) => {
    item.triggered = false;
    item.base.material.opacity = 0.42;
  });
  blackout.classList.remove("active");
  if (ghost) ghost.visible = false;
  dialogue.classList.add("hidden");
}

function writeLog(text) {
  const node = document.createElement("div");
  node.className = "entry";
  node.textContent = text;
  eventLog.appendChild(node);
  while (eventLog.children.length > 5) {
    eventLog.removeChild(eventLog.children[1]);
  }
}

function showDialogue(event) {
  speaker.textContent = event.speaker;
  line.textContent = event.line;
  dialogue.classList.remove("hidden");
  activeDialogueTimer = 5.2;
}

function fireEvent(item) {
  item.triggered = true;
  item.base.material.opacity = 0.12;
  eventCount += 1;
  writeLog(`触发：${item.event.label}`);
  showDialogue(item.event);
  if (item.event.blackout) {
    blackout.classList.add("active");
    blackoutTimer = 2.1;
  }
  if (item.event.ghost && ghost) {
    ghost.visible = true;
    ghost.position.z = -25;
  }
}

function updatePlayer(dt) {
  if (isEditingText()) {
    velocity.set(0, 0, 0);
    return;
  }
  direction.set(0, 0, 0);
  if (keys.has("KeyW")) direction.z -= 1;
  if (keys.has("KeyS")) direction.z += 1;
  if (keys.has("KeyA")) direction.x -= 1;
  if (keys.has("KeyD")) direction.x += 1;
  direction.normalize();

  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.0 : 4.0;
  forward.set(Math.sin(yawAngle), 0, Math.cos(yawAngle));
  right.set(Math.cos(yawAngle), 0, -Math.sin(yawAngle));
  velocity.copy(forward).multiplyScalar(direction.z * speed);
  velocity.addScaledVector(right, direction.x * speed);

  yaw.position.addScaledVector(velocity, dt);
  yaw.position.x = THREE.MathUtils.clamp(yaw.position.x, -6.6, 6.6);
  yaw.position.z = THREE.MathUtils.clamp(yaw.position.z, -40, 11);
}

function updateTriggers(dt) {
  const p = yaw.position;
  pendingInteraction = null;
  let promptText = "";

  for (const item of triggerMeshes) {
    item.orb.rotation.y += dt * 1.5;
    item.orb.position.y = 1.45 + Math.sin(clock.elapsedTime * 2.4 + item.event.position.x) * 0.1;
    const distance = p.distanceTo(item.event.position);
    item.base.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.05);

    if (item.triggered) continue;

    if (item.event.triggerType === "interaction" && distance < 2.45) {
      pendingInteraction = item;
      promptText = `按 E：${item.event.label}`;
      if (interactPressed) fireEvent(item);
      continue;
    }

    if (item.event.triggerType === "gaze" && distance < 5.5) {
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      const toTarget = item.event.position.clone().sub(p).normalize();
      promptText = `看向：${item.event.label}`;
      if (cameraDirection.dot(toTarget) > 0.82) fireEvent(item);
      continue;
    }

    if (distance < 2.05) {
      fireEvent(item);
    }
  }

  interactionPrompt.textContent = promptText || "按 E 触发";
  interactionPrompt.classList.toggle("hidden", !promptText);
  interactPressed = false;

  if (ghost?.visible) {
    ghost.lookAt(p.x, ghost.position.y, p.z);
    ghost.position.z += Math.sin(clock.elapsedTime * 2) * dt * 0.18;
  }

  if (activeDialogueTimer > 0) {
    activeDialogueTimer -= dt;
    if (activeDialogueTimer <= 0) dialogue.classList.add("hidden");
  }

  if (blackoutTimer > 0) {
    blackoutTimer -= dt;
    if (blackoutTimer <= 0) blackout.classList.remove("active");
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updatePlayer(dt);
  updateTriggers(dt);
  document.body.dataset.playerX = yaw.position.x.toFixed(3);
  document.body.dataset.playerZ = yaw.position.z.toFixed(3);
  document.body.dataset.triggered = String(eventCount);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

document.addEventListener("keydown", (event) => {
  if (isEditingText(event.target)) return;
  keys.add(event.code);
  if (event.code === "KeyE") interactPressed = true;
});
document.addEventListener("keyup", (event) => keys.delete(event.code));

renderer.domElement.addEventListener("click", () => {
  renderer.domElement.requestPointerLock();
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yawAngle -= event.movementX * 0.0024;
  pitchAngle -= event.movementY * 0.0024;
  pitchAngle = THREE.MathUtils.clamp(pitchAngle, -1.35, 1.35);
  yaw.rotation.y = yawAngle;
  pitch.rotation.x = pitchAngle;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const raw = input.value.trim() || DEFAULT_DREAM;
  if (currentDraft && raw === lastParsedRaw) {
    renderDraft(syncDraftFromPanel() || currentDraft);
    writeLog("已打开当前分镜草稿。");
    return;
  }
  renderDraft(createDreamDraft(raw));
});

directGenerateButton.addEventListener("click", () => {
  const raw = input.value.trim() || DEFAULT_DREAM;
  const usesCurrentDraft = currentDraft && raw === lastParsedRaw;
  if (usesCurrentDraft) syncPanelFromStory();
  const draft = usesCurrentDraft ? syncDraftFromPanel() || currentDraft : createDreamDraft(raw);
  renderDraft(draft);
  buildWorld(draft);
  setMode("play");
  writeLog(usesCurrentDraft ? "已根据当前分镜直接生成梦境。" : "已根据自动分镜直接生成梦境。");
});

confirmDreamButton.addEventListener("click", () => {
  syncPanelFromStory();
  const draft = syncDraftFromPanel() || readDraftFromPanel();
  currentDraft = draft;
  buildWorld(draft);
  draftPanel.classList.add("hidden");
  setMode("play");
  writeLog("已根据确认后的分镜生成梦境。");
});

refreshDraftButton.addEventListener("click", () => {
  renderDraft(createDreamDraft(input.value.trim() || DEFAULT_DREAM));
  writeLog("已从原始梦境文本重新解析。");
});

closeDraftButton.addEventListener("click", () => {
  draftPanel.classList.add("hidden");
  setMode(dreamModel ? "play" : "compose");
});

saveDreamButton.addEventListener("click", saveDreamFile);

loadDreamButton.addEventListener("click", () => {
  dreamFileInput.click();
});

dreamFileInput.addEventListener("change", () => {
  const file = dreamFileInput.files?.[0];
  if (file) loadDreamFile(file);
  dreamFileInput.value = "";
});

storyboard.addEventListener("input", () => {
  syncDraftFromPanel({ regenerateStory: true });
});

storyboard.addEventListener("change", () => {
  syncDraftFromPanel({ regenerateStory: true });
});

storyOutput.addEventListener("input", () => {
  syncPanelFromStory();
});

storyOutput.addEventListener("change", () => {
  syncPanelFromStory();
});

replayButton.addEventListener("click", () => {
  resetPlayer();
  writeLog("触发状态已重置。");
});

openComposeButton.addEventListener("click", () => {
  setMode("compose");
});

openDraftButton.addEventListener("click", () => {
  renderDraft(currentDraft || createDreamDraft(input.value.trim() || DEFAULT_DREAM));
});

toggleLogButton.addEventListener("click", () => {
  logPopover.classList.toggle("hidden");
});

buildWorld(DEFAULT_DREAM);
setMode("compose");
const dreamParam = new URLSearchParams(window.location.search).get("dream");
if (dreamParam) {
  const draft = createDreamDraft(dreamParam);
  currentDraft = draft;
  input.value = dreamParam;
  renderDraft(draft);
  buildWorld(draft);
  setMode("draft");
}
window.__dreamDebug = {
  getPosition: () => ({ x: yaw.position.x, y: yaw.position.y, z: yaw.position.z }),
  getTriggeredCount: () => eventCount,
  getCanvasCount: () => document.querySelectorAll("canvas").length,
  getObjectCount: () => world.children.length,
  getPropLabels: () => [...propLabels],
  generateFromText: (text) => {
    const draft = createDreamDraft(text || DEFAULT_DREAM);
    currentDraft = draft;
    renderDraft(draft);
    buildWorld(draft);
    return { scenes: draft.scenes.length, props: [...propLabels], title: draft.title };
  },
};
animate();
