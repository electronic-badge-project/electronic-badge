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
    showStatus(status, "这个浏览器没法显示三维模型，先显示演示图。");
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
  const screenContext = screenCanvas.getContext("2d", { willReadFrequently: true });
  const texture = new THREE.CanvasTexture(screenCanvas);
  const baked = [null, null, null, null];
  window.__badgeBaked = baked;
  let effect = { name: "place", dark: false, turns: 0 };
  const firstPhoto = document.querySelector(".stage-fallback");
  const bake = (image, index) => {
    if (!image.naturalWidth) return;
    const copy = document.createElement("canvas");
    copy.width = 512;
    copy.height = 512;
    copy.getContext("2d").drawImage(image, 0, 0, 512, 512);
    baked[index] = copy;
  };
  const watch = (image, index) => {
    if (image.complete && image.naturalWidth) bake(image, index);
    else image.addEventListener("load", () => bake(image, index), { once: true });
  };
  watch(firstPhoto, 0);
  const loadRest = () => {
    ["assets/demo/02.jpg", "assets/demo/03.jpg", "assets/demo/04.jpg"].forEach((src, index) => {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      watch(image, index + 1);
    });
  };
  if (firstPhoto.complete) loadRest();
  else firstPhoto.addEventListener("load", loadRest, { once: true });
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
    if (front.z >= 0.9) showStatus(status, "演示图已经在圆屏上。");
    window.__badge = {
      ready: true,
      frontZ: front.z,
      shown: () => shown,
      rotation: () => ({ x: rig.rotation.x, y: rig.rotation.y, z: rig.rotation.z }),
      setOrbit(value) { stage.style.setProperty("--orbit", String(value)); },
      effect: () => effect,
      sample() {
        const px = screenContext.getImageData(256, 256, 1, 1).data;
        return [px[0], px[1], px[2]];
      },
    };
  }, undefined, () => {
    showStatus(status, "模型没有载入，先显示演示图。");
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
    const tiltOn = pointerQuery.matches && shown < 0.08;
    tiltX += ((tiltOn ? targetTiltX : 0) - tiltX) * 0.12;
    tiltY += ((tiltOn ? targetTiltY : 0) - tiltY) * 0.12;
    // Screen normal is +Z and the camera sits on +Z. Keep yaw and pitch at the pointer tilt only.
    rig.rotation.set(tiltX, tiltY, 0);
    effect = effectAt(shown, playing ? clock : 0);
    try {
      paintScreen(screenContext, effect);
      texture.needsUpdate = true;
    } catch (error) {
      window.__badgeError = `${error.message} effect=${effect.name}`;
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

// Firmware ease: smoothstep on 0..255, rounded. picture_animation.h.
function easeUnit(t) {
  const x = Math.min(255, Math.max(0, t * 255));
  return ((x * x * (765 - 2 * x) + 32512) / 65025) / 255;
}

// Fade is a brightness dip, not a crossfade. 130ms down, swap at black, 170ms up.
function fadeBrightness(t) {
  const out = 130 / 300;
  if (t <= out) return 1 - easeUnit(t / out);
  return easeUnit((t - out) / (1 - out));
}

function effectAt(orbit, clock) {
  // The device turns once in about 24s. The hero demo is faster so the motion, and its pause button, are visible.
  const heroTurn = clock > 0 && orbit < 0.12 ? (clock % 10) / 10 : 0;
  const hold = (name, index, turns = 0) => ({ name, index, turns, brightness: 1, dark: false, mode: "still" });
  if (orbit < 0.28) return hold("place", 0, heroTurn);
  if (orbit < 0.4) {
    const t = Math.min(1, (orbit - 0.28) / 0.12);
    const brightness = fadeBrightness(t);
    return {
      name: "fade",
      index: t < 130 / 300 ? 0 : 1,
      next: 1,
      t,
      brightness,
      dark: brightness < 0.28,
      mode: "fade",
      turns: 0,
    };
  }
  if (orbit < 0.52) return hold("fade", 1);
  if (orbit < 0.68) {
    const t = Math.min(1, (orbit - 0.52) / 0.16);
    return { name: "slide", index: 1, next: 2, offset: easeUnit(t) * 512, dark: false, mode: "slide", brightness: 1, turns: 0 };
  }
  if (orbit < 0.7) return hold("slide", 2);
  if (orbit < 0.86) {
    const t = Math.min(1, (orbit - 0.7) / 0.16);
    return { name: "ripple", index: 2, next: 3, radius: t * 512, dark: false, mode: "ripple", brightness: 1, turns: 0 };
  }
  if (orbit < 0.88) return hold("ripple", 3);
  return hold("spin", 3, Math.min(1, (orbit - 0.88) / 0.12) * 0.2);
}

function paintScreen(context, effect) {
  context.globalAlpha = 1;
  context.clearRect(0, 0, 512, 512);
  context.fillStyle = "#000";
  context.fillRect(0, 0, 512, 512);
  const current = bakedImage(effect.index);
  const next = bakedImage(effect.next);
  if (effect.mode === "fade") {
    drawDim(context, effect.t < 130 / 300 ? current : next, effect.brightness);
    return;
  }
  if (effect.mode === "slide") {
    drawSlide(context, current, next, effect.offset);
    return;
  }
  if (effect.mode === "ripple") {
    drawRipple(context, current, next, effect.radius);
    return;
  }
  if (effect.turns) drawRotated(context, current, effect.turns);
  else if (current) context.drawImage(current, 0, 0);
}

function bakedImage(index) {
  const frames = window.__badgeBaked;
  return frames && Number.isInteger(index) ? frames[index] : null;
}

function drawRotated(context, image, turns) {
  if (!image) return;
  context.save();
  context.translate(256, 256);
  context.rotate(turns * Math.PI * 2);
  context.drawImage(image, -256, -256);
  context.restore();
}

function drawDim(context, image, brightness) {
  if (!image) return;
  context.drawImage(image, 0, 0);
  if (brightness < 0.999) {
    context.fillStyle = `rgba(0, 0, 0, ${1 - brightness})`;
    context.fillRect(0, 0, 512, 512);
  }
}

function drawSlide(context, oldImage, newImage, offset) {
  const shift = Math.max(0, Math.min(512, Math.round(offset)));
  const seam = 512 - shift;
  if (oldImage && seam > 0) context.drawImage(oldImage, shift, 0, seam, 512, 0, 0, seam, 512);
  if (newImage && shift > 0) context.drawImage(newImage, 0, 0, shift, 512, seam, 0, shift, 512);
}

function drawRipple(context, oldImage, newImage, radius) {
  if (oldImage) context.drawImage(oldImage, 0, 0);
  if (!newImage || radius <= 0) return;
  context.save();
  context.beginPath();
  context.arc(256, 256, radius, 0, Math.PI * 2);
  context.clip();
  context.drawImage(newImage, 0, 0);
  context.restore();
  const band = 6 * (512 / 466);
  if (radius <= band || radius >= 500) return;
  context.beginPath();
  context.arc(256, 256, radius, 0, Math.PI * 2);
  context.arc(256, 256, radius - band, 0, Math.PI * 2, true);
  context.fillStyle = "rgba(255, 255, 255, 0.25)";
  context.fill("evenodd");
  context.beginPath();
  context.arc(256, 256, radius + band, 0, Math.PI * 2);
  context.arc(256, 256, radius, 0, Math.PI * 2, true);
  context.fillStyle = "rgba(0, 0, 0, 0.25)";
  context.fill("evenodd");
}
