import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

setupNav();
setupScrollFrost();
setupRevealFallback();
setupStage();

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function mapRange(value, inA, inB, outA, outB) {
  const t = clamp01((value - inA) / (inB - inA));
  return outA + t * (outB - outA);
}

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

function setupRevealFallback() {
  const nativeViewTimeline = CSS.supports("(animation-timeline: view()) and (animation-range: entry)");
  if (nativeViewTimeline || reduced.matches) return;

  const items = [...document.querySelectorAll(".reveal")];
  if (!items.length) return;

  document.documentElement.classList.add("has-reveal-js");
  const observer = new IntersectionObserver(
    (entries) => {
      let batch = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const delay = Math.min(batch * 40, 160);
        entry.target.style.transitionDelay = `${delay}ms`;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
        batch += 1;
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -36px 0px" }
  );

  for (const el of items) observer.observe(el);
}

function setupStage() {
  const film = document.getElementById("film");
  const stage = document.querySelector(".stage");
  const canvas = document.getElementById("badge-stage");
  const status = document.getElementById("stage-status");
  const toggle = document.getElementById("demo-toggle");
  const view = canvas.parentElement;
  const frame = stage.querySelector(".stage-frame");
  const capCards = [...document.querySelectorAll(".cap-card")];
  const chapterPills = [...document.querySelectorAll(".chapter-pill")];
  const pointerQuery = matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");

  const BEAT_TARGETS = [0.22, 0.41, 0.59, 0.77, 0.93];
  const BEAT_IDS = ["place", "fade", "slide", "ripple", "spin"];

  let playing = !reduced.matches;
  let filmStart = 0;
  let filmSpan = 1;
  let targetProgress = 0;
  let manualOverride = null;
  let shown = 0;
  let activeBeat = 0;
  let tiltX = 0;
  let tiltY = 0;
  let targetTiltX = 0;
  let targetTiltY = 0;
  let filmVisible = true;
  let rafId = 0;
  let modelLoaded = false;

  toggle.textContent = playing ? "暂停画面" : "播放画面";
  toggle.addEventListener("click", () => {
    playing = !playing;
    toggle.textContent = playing ? "暂停画面" : "播放画面";
    if (playing) ensureLoop();
  });

  const measureFilm = () => {
    filmStart = film.offsetTop;
    filmSpan = Math.max(1, film.offsetHeight - window.innerHeight);
    if (manualOverride === null) {
      targetProgress = clamp01((window.scrollY - filmStart) / filmSpan);
    }
  };

  const syncCinemaMode = () => {
    const enabled = !reduced.matches;
    document.documentElement.classList.toggle("is-cinema-ready", enabled);
    if (!enabled) {
      document.documentElement.classList.remove("is-dark-beat", "is-hero-hidden");
      film.style.removeProperty("--cinema-in");
      film.style.removeProperty("--hero-out");
      film.style.removeProperty("--cinema-progress");
      shown = 0;
      targetProgress = 0;
      playing = false;
      toggle.textContent = "播放画面";
    } else {
      measureFilm();
    }
    ensureLoop();
  };

  const scrollToBeat = (beatIndex) => {
    const idx = Math.max(0, Math.min(BEAT_TARGETS.length - 1, beatIndex));
    if (reduced.matches) {
      const targetEl = document.getElementById(BEAT_IDS[idx]);
      if (targetEl) targetEl.scrollIntoView({ behavior: "auto" });
      return;
    }
    measureFilm();
    const top = filmStart + filmSpan * BEAT_TARGETS[idx];
    window.scrollTo({ top, behavior: "smooth" });
  };

  chapterPills.forEach((btn) => {
    btn.addEventListener("click", () => {
      scrollToBeat(Number(btn.dataset.beat));
    });
  });

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || reduced.matches) return;
    const id = anchor.getAttribute("href").slice(1);
    const beatIndex = BEAT_IDS.indexOf(id);
    if (beatIndex === -1) return;
    event.preventDefault();
    scrollToBeat(beatIndex);
  });

  window.addEventListener(
    "scroll",
    () => {
      if (manualOverride !== null) return;
      targetProgress = clamp01((window.scrollY - filmStart) / filmSpan);
      if (filmVisible) ensureLoop();
    },
    { passive: true }
  );

  window.addEventListener("resize", measureFilm, { passive: true });
  reduced.addEventListener("change", syncCinemaMode);

  frame.addEventListener("pointermove", (event) => {
    if (!pointerQuery.matches) return;
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const rect = frame.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    targetTiltY = nx * 0.1;
    targetTiltX = -ny * 0.07;
  });
  frame.addEventListener("pointerleave", () => {
    targetTiltX = 0;
    targetTiltY = 0;
  });

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    showStatus(status, "这个浏览器没法显示三维模型，先显示演示图。");
    syncCinemaMode();
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  camera.position.set(0, 0.008, 0.168);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 1, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Refined Apple-style studio key + rim lighting to articulate the CNC Satin Aluminium edge
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(0.35, 0.5, 0.6);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xc8deff, 0.65);
  rimLight.position.set(-0.55, 0.25, -0.3);
  scene.add(rimLight);

  const rig = new THREE.Group();
  scene.add(rig);

  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 512;
  screenCanvas.height = 512;
  const screenContext = screenCanvas.getContext("2d", { willReadFrequently: true });
  const texture = new THREE.CanvasTexture(screenCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;

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

  const loader = new GLTFLoader();
  loader.load(
    "assets/picture-badge.glb",
    (gltf) => {
      rig.add(gltf.scene);
      const screen = gltf.scene.getObjectByName("Screen");
      const material = screen.material.clone();
      material.color.set(0xffffff);
      material.emissive.set(0xffffff);
      material.emissiveMap = texture;
      material.emissiveIntensity = 1.18;
      material.map = texture;
      material.metalness = 0;
      material.roughness = 0.28;
      screen.material = material;

      const front = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
      if (front.z < 0.9) showStatus(status, "模型朝向和屏幕法线不一致。");
      view.classList.add("is-ready");
      view.querySelector(".stage-fallback").setAttribute("aria-hidden", "true");
      if (front.z >= 0.9) showStatus(status, "演示图已经在圆屏上。");
      modelLoaded = true;

      window.__badge = {
        ready: true,
        frontZ: front.z,
        shown: () => shown,
        rotation: () => ({ x: rig.rotation.x, y: rig.rotation.y, z: rig.rotation.z }),
        setOrbit(value) {
          manualOverride = clamp01(Number(value));
          targetProgress = manualOverride;
          ensureLoop();
        },
        effect: () => effect,
        sample() {
          const px = screenContext.getImageData(256, 256, 1, 1).data;
          return [px[0], px[1], px[2]];
        },
      };
      ensureLoop();
    },
    undefined,
    () => {
      showStatus(status, "模型没有载入，先显示演示图。");
    }
  );

  const resize = () => {
    const width = Math.max(view.clientWidth, 1);
    const height = Math.max(view.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (modelLoaded) renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(view);
  resize();

  // Pause Three.js loop when the cinema section scrolls off-screen (conserves GPU/battery)
  const visObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        filmVisible = entry.isIntersecting;
        if (!filmVisible) {
          document.documentElement.classList.remove("is-dark-beat");
        } else {
          ensureLoop();
        }
      }
    },
    { rootMargin: "200px 0px" }
  );
  visObserver.observe(film);

  let clock = 0;
  let last = performance.now();
  let lastHeroOut = -1;
  let lastCinemaIn = -1;
  let lastCinemaProg = -1;

  const setActiveBeat = (index) => {
    if (index === activeBeat) return;
    activeBeat = index;
    capCards.forEach((card, i) => card.classList.toggle("is-active", i === index));
    chapterPills.forEach((btn, i) => {
      const isCurrent = i === index;
      btn.classList.toggle("is-active", isCurrent);
      if (isCurrent) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
    });
  };

  function ensureLoop() {
    if (rafId || document.hidden || !filmVisible) return;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    rafId = 0;
    if (document.hidden || !filmVisible) return;

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playing) clock += dt;

    const target = reduced.matches ? 0 : targetProgress;
    const damping = reduced.matches ? 1 : 0.1;
    shown += (target - shown) * damping;
    if (Math.abs(target - shown) < 0.0005) shown = target;

    if (!reduced.matches) {
      const heroOut = mapRange(shown, 0.015, 0.13, 0, 1);
      const cinemaIn = mapRange(shown, 0.05, 0.18, 0, 1);
      const cinemaProg = mapRange(shown, 0.16, 0.98, 0, 1);

      if (Math.abs(heroOut - lastHeroOut) > 0.002) {
        film.style.setProperty("--hero-out", heroOut.toFixed(3));
        document.documentElement.classList.toggle("is-hero-hidden", heroOut > 0.96);
        lastHeroOut = heroOut;
      }
      if (Math.abs(cinemaIn - lastCinemaIn) > 0.002) {
        film.style.setProperty("--cinema-in", cinemaIn.toFixed(3));
        lastCinemaIn = cinemaIn;
      }
      if (Math.abs(cinemaProg - lastCinemaProg) > 0.002) {
        film.style.setProperty("--cinema-progress", cinemaProg.toFixed(3));
        lastCinemaProg = cinemaProg;
      }

      // Nav & dock morph into dark OLED mode only while inside the dark cinema band
      const leavingBottom = window.scrollY > filmStart + filmSpan - window.innerHeight * 0.12;
      document.documentElement.classList.toggle("is-dark-beat", cinemaIn > 0.45 && !leavingBottom);

      const beatIdx = beatIndexAt(shown);
      setActiveBeat(beatIdx);
    }

    // Subtle 3D hardware presentation angle + pointer tilt
    const tiltOn = pointerQuery.matches && shown < 0.1;
    tiltX += ((tiltOn ? targetTiltX : 0) - tiltX) * 0.12;
    tiltY += ((tiltOn ? targetTiltY : 0) - tiltY) * 0.12;

    const showcase = reduced.matches ? { x: 0, y: 0 } : hardwareAngleAt(shown);
    rig.rotation.set(tiltX + showcase.x, tiltY + showcase.y, 0);

    effect = effectAt(shown, playing ? clock : 0);
    try {
      paintScreen(screenContext, effect);
      texture.needsUpdate = true;
    } catch (error) {
      window.__badgeError = `${error.message} effect=${effect.name}`;
    }
    renderer.render(scene, camera);

    const settling =
      Math.abs(target - shown) > 0.0005 ||
      Math.abs((tiltOn ? targetTiltX : 0) - tiltX) > 0.0005 ||
      Math.abs((tiltOn ? targetTiltY : 0) - tiltY) > 0.0005;

    if (playing || settling || !modelLoaded) {
      rafId = requestAnimationFrame(loop);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && filmVisible) ensureLoop();
  });

  syncCinemaMode();
  measureFilm();
  ensureLoop();
}

function beatIndexAt(orbit) {
  if (orbit < 0.30) return 0;
  if (orbit < 0.50) return 1;
  if (orbit < 0.68) return 2;
  if (orbit < 0.85) return 3;
  return 4;
}

// Gentle 3/4 hardware reveal on Beat 0 to showcase CNC aluminium bezel & side keys,
// settling face-on for crisp 1:1 firmware transition inspection.
function hardwareAngleAt(orbit) {
  if (orbit < 0.12) return { x: 0, y: 0 };
  if (orbit < 0.30) {
    const t = (orbit - 0.12) / 0.18;
    const arc = Math.sin(t * Math.PI);
    return { x: -0.08 * arc, y: 0.36 * arc };
  }
  if (orbit < 0.85) {
    const t = (orbit - 0.30) / 0.55;
    return { x: 0.02 * Math.sin(t * Math.PI * 2), y: 0.06 * Math.sin(t * Math.PI * 2) };
  }
  const t = clamp01((orbit - 0.85) / 0.15);
  const arc = Math.sin(t * Math.PI);
  return { x: 0.05 * arc, y: -0.16 * arc };
}

function showStatus(status, text) {
  status.textContent = text;
  const failed = text.includes("没法") || text.includes("没有载入") || text.includes("不一致");
  status.classList.toggle("is-quiet", !failed);
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
  // The device turns once in about 24s. Hero & spin beat turn slightly faster so motion and pause control stay clear.
  const heroTurn = clock > 0 && orbit < 0.12 ? (clock % 14) / 14 : 0;
  const hold = (name, index, turns = 0) => ({ name, index, turns, brightness: 1, dark: false, mode: "still" });
  if (orbit < 0.30) return hold("place", 0, heroTurn);
  if (orbit < 0.45) {
    const t = clamp01((orbit - 0.30) / 0.15);
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
  if (orbit < 0.50) return hold("fade", 1);
  if (orbit < 0.65) {
    const t = clamp01((orbit - 0.50) / 0.15);
    return {
      name: "slide",
      index: 1,
      next: 2,
      offset: easeUnit(t) * 512,
      dark: false,
      mode: "slide",
      brightness: 1,
      turns: 0,
    };
  }
  if (orbit < 0.68) return hold("slide", 2);
  if (orbit < 0.82) {
    const t = clamp01((orbit - 0.68) / 0.14);
    return {
      name: "ripple",
      index: 2,
      next: 3,
      radius: t * 512,
      dark: false,
      mode: "ripple",
      brightness: 1,
      turns: 0,
    };
  }
  if (orbit < 0.85) return hold("ripple", 3);
  const spinScroll = clamp01((orbit - 0.85) / 0.15) * 0.25;
  const spinIdle = clock > 0 ? (clock % 24) / 24 : 0;
  return hold("spin", 3, spinScroll + spinIdle);
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
