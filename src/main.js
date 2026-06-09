import * as THREE from "./vendor/three.module.js";

const DEFAULT_DREAM = `旧医院的走廊，没有窗，墙上贴着褪色的海报。
我往前走，尽头像地铁站，地面有很浅的水。
左边有一座小神龛，里面的灯一闪一闪。
走到售票机旁边会突然停电，有个影子站在远处。
一个穿白衣的人说：你不是第一次回来。`;

const app = document.querySelector("#app");
app.innerHTML = `
  <main class="shell">
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
          <span><kbd>Shift</kbd> 慢走</span>
          <span><kbd>Esc</kbd> 释放鼠标</span>
        </div>
      </div>

      <div class="center-reticle" aria-hidden="true"></div>

      <form class="composer" id="composer">
        <label for="dream-input">
          梦的碎片
          <span class="hint">输入后重建场景</span>
        </label>
        <textarea id="dream-input" spellcheck="false"></textarea>
        <div class="button-row">
          <button class="primary" type="submit">生成梦境</button>
          <button type="button" id="replay">重放触发</button>
        </div>
      </form>

      <div class="event-log" id="event-log">
        <strong>触发记录</strong>
        <div class="entry">还没有触发。靠近发光物体试试。</div>
      </div>

      <div class="dialogue hidden" id="dialogue">
        <div class="speaker" id="speaker">NPC</div>
        <div class="line" id="line"></div>
      </div>

      <div class="blackout" id="blackout"></div>
      <div class="vignette"></div>

      <div class="overlay" id="overlay">
        <div class="start-card">
          <h2>把梦走回去</h2>
          <p>这是一个可玩的最小原型：你可以用碎片化描述生成一段梦核场景，然后第一视角移动，靠近特定地点触发停电、影子和对白。</p>
          <button class="primary" id="start" type="button">进入梦境</button>
        </div>
      </div>
    </section>
  </main>
`;

const input = document.querySelector("#dream-input");
const form = document.querySelector("#composer");
const statusEl = document.querySelector("#status");
const titleEl = document.querySelector("#scene-title");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start");
const dialogue = document.querySelector("#dialogue");
const speaker = document.querySelector("#speaker");
const line = document.querySelector("#line");
const blackout = document.querySelector("#blackout");
const eventLog = document.querySelector("#event-log");
const replayButton = document.querySelector("#replay");

input.value = DEFAULT_DREAM;

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

function buildDreamModel(text) {
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
    events: [
      {
        id: "shrine",
        label: hasShrine ? "小神龛" : "异常的灯",
        position: new THREE.Vector3(-5.5, 1, -8),
        color: 0xd6b36b,
        speaker: "白衣人",
        line: hasShrine ? "灯在闪。它像是在等你承认这是真的。" : "这盏灯不该在这里。",
      },
      {
        id: "blackout",
        label: hasBlackout ? "停电点" : "售票机",
        position: new THREE.Vector3(4.8, 1, -17),
        color: 0x7fc5d8,
        speaker: "广播",
        line: hasBlackout ? "请留在原地。请不要回头。" : "下一班车已经取消。",
        blackout: hasBlackout,
      },
      {
        id: "ghost",
        label: hasGhost ? "远处的影子" : "不该出现的人",
        position: new THREE.Vector3(0, 1, -29),
        color: 0xd58b9b,
        speaker: hasGhost ? "影子" : "陌生人",
        line: quoteMatch ? quoteMatch[1].trim() : "你不是第一次回来。",
        ghost: true,
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
}

function addBox({ size, position, material, cast = true, receive = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  world.add(mesh);
  return mesh;
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

function buildWorld(text) {
  clearWorld();
  dreamModel = buildDreamModel(text);
  titleEl.textContent = dreamModel.title;
  statusEl.textContent = `${dreamModel.mood}。靠近发光位置会触发情节。`;

  const ambient = new THREE.HemisphereLight(0xb8d3ca, 0x0c0f0b, 0.54);
  world.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xc9d7c0, 0.72);
  keyLight.position.set(-8, 11, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  world.add(keyLight);

  addBox({ size: [15, 0.22, 74], position: [0, -0.1, -14], material: palette.darkConcrete, cast: false });
  addBox({ size: [15, 0.26, 74], position: [0, 4.2, -14], material: palette.darkConcrete, cast: false });
  addBox({ size: [0.24, 4.5, 74], position: [-7.5, 2, -14], material: palette.concrete, cast: false });
  addBox({ size: [0.24, 4.5, 74], position: [7.5, 2, -14], material: palette.concrete, cast: false });

  for (let z = 8; z > -42; z -= 8) {
    addBox({ size: [0.16, 4, 0.16], position: [-5.8, 1.9, z], material: palette.concrete });
    addBox({ size: [0.16, 4, 0.16], position: [5.8, 1.9, z], material: palette.concrete });

    const lamp = new THREE.PointLight(z % 16 === 0 ? 0x89d6a3 : 0xd6b36b, 0.82, 9);
    lamp.position.set(0, 3.6, z);
    world.add(lamp);
    addBox({ size: [1.2, 0.08, 0.28], position: [0, 3.55, z], material: palette.greenGlow, cast: false });
  }

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

  dreamModel.events.forEach(addMarker);
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
  for (const item of triggerMeshes) {
    item.orb.rotation.y += dt * 1.5;
    item.orb.position.y = 1.45 + Math.sin(clock.elapsedTime * 2.4 + item.event.position.x) * 0.1;
    const distance = p.distanceTo(item.event.position);
    item.base.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.05);
    if (!item.triggered && distance < 2.05) {
      fireEvent(item);
    }
  }

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

document.addEventListener("keydown", (event) => keys.add(event.code));
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
  buildWorld(input.value.trim() || DEFAULT_DREAM);
});

replayButton.addEventListener("click", () => {
  resetPlayer();
  writeLog("触发状态已重置。");
});

startButton.addEventListener("click", () => {
  overlay.style.display = "none";
  renderer.domElement.requestPointerLock();
});

buildWorld(DEFAULT_DREAM);
window.__dreamDebug = {
  getPosition: () => ({ x: yaw.position.x, y: yaw.position.y, z: yaw.position.z }),
  getTriggeredCount: () => eventCount,
  getCanvasCount: () => document.querySelectorAll("canvas").length,
};
animate();
