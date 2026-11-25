import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const scrollDriven = CSS.supports("(animation-timeline: scroll()) and (animation-range: 0% 100%)");

setupNav();
setupScrollFrost();
setupStage();

function setupNav() {
  const header = document.querySelector(".site-header");
  const inner = header.querySelector(".header-inner");
  const menu = document.getElementById("site-menu");
  let lastWidth = 0;

  const sync = () => {
    const wasOpen = menu.matches(":popover-open");
    header.classList.add("is-measuring");
    header.classList.add("is-wide");
    const fits = inner.scrollWidth <= inner.clientWidth + 1;
    header.classList.toggle("is-wide", fits);
    if (fits) {
      menu.removeAttribute("popover");
    } else if (!menu.hasAttribute("popover")) {
      menu.setAttribute("popover", "auto");
      if (wasOpen) menu.showPopover();
    }
    requestAnimationFrame(() => header.classList.remove("is-measuring"));
    document.documentElement.style.setProperty("--header-block", `${header.offsetHeight}px`);
  };

  const observer = new ResizeObserver(() => {
    const width = header.clientWidth;
    if (header.classList.contains("is-wide") || width > lastWidth) sync();
    lastWidth = width;
  });
  observer.observe(header);
  observer.observe(menu);
  sync();

  menu.addEventListener("click", (event) => {
    if (event.target.closest("a") && menu.hasAttribute("popover")) menu.hidePopover();
  });
}

function setupScrollFrost() {
  if (CSS.supports("container-type", "scroll-state")) return;
  const sentinel = document.querySelector(".scroll-sentinel");
  if (!sentinel) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      document.documentElement.classList.toggle("is-scrolled", !entry.isIntersecting);
    }
  });
  observer.observe(sentinel);
}

function setupStage() {
  const stage = document.querySelector(".stage");
  const canvas = document.getElementById("badge-stage");
  const status = document.getElementById("stage-status");
  const toggle = document.getElementById("demo-toggle");
  const view = canvas.parentElement;
  const frame = stage.querySelector(".stage-frame");
  const pointerQuery = matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
  let playing = !reduced.matches;
  let shown = 0;
  let tiltX = 0;
  let tiltY = 0;
  let targetTiltX = 0;
  let targetTiltY = 0;
  toggle.textContent = playing ? "暂停画面" : "播放画面";

  toggle.addEventListener("click", () => {
    playing = !playing;
    toggle.textContent = playing ? "暂停画面" : "播放画面";
  });

  frame.addEventListener("pointermove", (event) => {
    if (!pointerQuery.matches) return;
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const rect = frame.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    // Camera sits on +Z. +yaw turns the face toward a pointer on the right.
    // +pitch brings +Y toward the camera, so a pointer above the product tips the top forward.
    targetTiltY = nx * 0.07;
    targetTiltX = -ny * 0.05;
  });
  frame.addEventListener("pointerleave", () => {
    targetTiltX = 0;
    targetTiltY = 0;
  });

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    showStatus(status, "这个浏览器没法显示三维模型，先用插画代替。");
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  camera.position.set(0, 0.01, 0.17);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 1, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const rig = new THREE.Group();
  scene.add(rig);
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 512;
  screenCanvas.height = 512;
  const screenContext = screenCanvas.getContext("2d");
  const texture = new THREE.CanvasTexture(screenCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;

  const loader = new GLTFLoader();
  loader.load("assets/picture-badge.glb", (gltf) => {
    rig.add(gltf.scene);
    const screen = gltf.scene.getObjectByName("Screen");
    const material = screen.material.clone();
    material.color.set(0xffffff);
    material.emissive.set(0xffffff);
    material.emissiveMap = texture;
    material.emissiveIntensity = 1.2;
    material.map = texture;
    material.metalness = 0;
    material.roughness = 0.32;
    screen.material = material;
    const front = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
    if (front.z < 0.9) showStatus(status, "模型朝向和屏幕法线不一致。");
    view.classList.add("is-ready");
    view.querySelector(".stage-fallback").setAttribute("aria-hidden", "true");
    if (front.z >= 0.9) showStatus(status, "滚动页面，徽章会转过来。");
    window.__badge = {
      ready: true,
      frontZ: front.z,
      shown: () => shown,
      rotation: () => ({ x: rig.rotation.x, y: rig.rotation.y, z: rig.rotation.z }),
      setOrbit(value) { stage.style.setProperty("--orbit", String(value)); },
    };
  }, undefined, () => {
    showStatus(status, "模型没有载入，先显示插画。");
  });

  let clock = 0;
  let last = performance.now();

  const resize = () => {
    const width = Math.max(view.clientWidth, 1);
    const height = Math.max(view.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  new ResizeObserver(resize).observe(view);
  resize();

  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) clock += dt;
    const target = reduced.matches ? 0 : readOrbit(stage);
    const damping = reduced.matches ? 1 : 0.12;
    shown += (target - shown) * damping;
    if (Math.abs(target - shown) < 0.0008) shown = target;
    const pose = poseAt(shown);
    const tiltOn = pointerQuery.matches && shown < 0.08;
    tiltX += ((tiltOn ? targetTiltX : 0) - tiltX) * 0.12;
    tiltY += ((tiltOn ? targetTiltY : 0) - tiltY) * 0.12;
    rig.rotation.set(pose.x + tiltX, pose.y + tiltY, 0);
    if (scrollDriven && !reduced.matches) {
      document.documentElement.classList.toggle("is-dark-beat", shown > 0.42 && shown < 0.68);
    }
    const scrolled = shown > 0.16;
    const frame = playing && !scrolled ? autoFrame(clock) : frameForOrbit(shown);
    try {
      paintScreen(screenContext, frame);
      texture.needsUpdate = true;
    } catch (error) {
      window.__badgeError = `${error.message} frame=${frame}`;
    }
    renderer.render(scene, camera);
    if (!document.hidden) requestAnimationFrame(loop);
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      last = performance.now();
      requestAnimationFrame(loop);
    }
  });
  requestAnimationFrame(loop);

  if (!(scrollDriven && !reduced.matches)) {
    const screenBeat = document.getElementById("screen");
    const observer = new IntersectionObserver((entries) => {
      document.documentElement.classList.toggle("is-dark-beat", entries.some((entry) => entry.isIntersecting));
    }, { threshold: 0.6 });
    observer.observe(screenBeat);
  }
}

function showStatus(status, text) {
  status.textContent = text;
  const failed = text.includes("没法") || text.includes("没有载入") || text.includes("不一致");
  status.classList.toggle("is-quiet", !failed);
}

function readOrbit(stage) {
  const value = Number.parseFloat(getComputedStyle(stage).getPropertyValue("--orbit"));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function autoFrame(clock) {
  const slot = 5.6;
  const phase = (clock % (slot * 4)) / slot;
  const index = Math.floor(phase);
  const local = phase - index;
  return index + (local > 0.8 ? (local - 0.8) / 0.2 : 0);
}

function frameForOrbit(orbit) {
  const gates = [0.4, 0.66, 0.86];
  const blend = 0.06;
  if (orbit < gates[0]) return 0;
  if (orbit < gates[1]) return orbit < gates[0] + blend ? (orbit - gates[0]) / blend : 1;
  if (orbit < gates[2]) return orbit < gates[1] + blend ? 1 + (orbit - gates[1]) / blend : 2;
  return orbit < gates[2] + blend ? 2 + (orbit - gates[2]) / blend : 3;
}

// Screen normals point +Z, USB-C sits at −Y, side keys sit at +X.
// Camera stays on +Z. Negative yaw brings +X toward the camera.
const POSES = [
  { p: 0, y: 0, x: 0 },
  { p: 0.4, y: 0, x: 0 },
  { p: 0.58, y: -0.12, x: 0 },
  { p: 0.7, y: -1.05, x: 0.06 },
  { p: 0.84, y: -1.05, x: 0.06 },
  { p: 0.94, y: -0.16, x: -0.62 },
  { p: 1, y: -0.16, x: -0.62 },
];

function poseAt(progress) {
  let from = POSES[0];
  let to = POSES[POSES.length - 1];
  for (let index = 0; index < POSES.length - 1; index += 1) {
    if (progress >= POSES[index].p && progress <= POSES[index + 1].p) {
      from = POSES[index];
      to = POSES[index + 1];
      break;
    }
  }
  const span = to.p - from.p || 1;
  const t = (progress - from.p) / span;
  const eased = t * t * (3 - 2 * t);
  return {
    y: from.y + (to.y - from.y) * eased,
    x: from.x + (to.x - from.x) * eased,
  };
}

function paintScreen(context, frame) {
  const whole = Number.isFinite(frame) ? Math.floor(frame) : 0;
  const index = ((whole % 4) + 4) % 4;
  const next = (index + 1) % 4;
  const mix = Number.isFinite(frame) ? frame - whole : 0;
  context.clearRect(0, 0, 512, 512);
  context.globalAlpha = 1;
  [drawPhoto, drawCrop, drawKeys, drawPort][index](context);
  if (mix > 0.001) {
    context.globalAlpha = mix;
    [drawPhoto, drawCrop, drawKeys, drawPort][next](context);
    context.globalAlpha = 1;
  }
}

function drawPhoto(context) {
  const sky = context.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#241a38");
  sky.addColorStop(0.42, "#c46a4a");
  sky.addColorStop(0.58, "#e7a15a");
  sky.addColorStop(1, "#1c3d46");
  context.fillStyle = sky;
  context.fillRect(0, 0, 512, 512);
  context.fillStyle = "#fff6df";
  context.beginPath();
  context.arc(300, 210, 42, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#14343c";
  context.beginPath();
  context.moveTo(0, 300);
  context.quadraticCurveTo(180, 250, 320, 320);
  context.quadraticCurveTo(420, 360, 512, 300);
  context.lineTo(512, 512);
  context.lineTo(0, 512);
  context.fill();
  context.fillStyle = "#0d242c";
  context.beginPath();
  context.moveTo(0, 380);
  context.quadraticCurveTo(200, 340, 512, 410);
  context.lineTo(512, 512);
  context.lineTo(0, 512);
  context.fill();
}

function drawCrop(context) {
  drawPhoto(context);
  context.strokeStyle = "#7eb6ff";
  context.lineWidth = 6;
  context.strokeRect(146, 146, 220, 220);
  context.fillStyle = "rgba(8, 16, 28, 0.28)";
  context.fillRect(0, 0, 512, 146);
  context.fillRect(0, 366, 512, 146);
  context.fillRect(0, 146, 146, 220);
  context.fillRect(366, 146, 146, 220);
}

function drawKeys(context) {
  context.fillStyle = "#101114";
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = "#e7c48a";
  context.lineWidth = 8;
  context.beginPath();
  context.arc(256, 256, 150, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#f4efe6";
  context.font = "600 42px 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif";
  context.textAlign = "center";
  context.fillText("短按菜单", 256, 246);
  context.fillStyle = "#c9c0b2";
  context.font = "28px 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif";
  context.fillText("长按睡眠", 256, 296);
}

function drawPort(context) {
  context.fillStyle = "#101114";
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = "#9fd0c4";
  context.lineWidth = 14;
  context.lineCap = "round";
  context.beginPath();
  context.arc(256, 256, 150, -Math.PI / 2, Math.PI * 0.85);
  context.stroke();
  context.fillStyle = "#f4efe6";
  context.font = "600 48px 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif";
  context.textAlign = "center";
  context.fillText("USB", 256, 268);
}
