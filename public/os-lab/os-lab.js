const V86_VERSION = "0.5.473";
const CDN = `https://cdn.jsdelivr.net/npm/v86@${V86_VERSION}/build/`;
/* The npm package has no BIOS images, so they come from the v86 repository at the commit the package was built from. */
const BIOS = "https://cdn.jsdelivr.net/gh/copy/v86@315b2b0b758703ef0e6cc7b4088d6068f83f3c20/bios/";
/* Guest images published by v86's author in github.com/copy/images, pinned to a commit. (i.copy.sh, the v86 demo's own
   image host, refuses requests that carry another site's referrer.) */
const IMAGES = "https://cdn.jsdelivr.net/gh/copy/images@db92d8fd4a53dbd73b8e0588bb4bd8fe37a1975a/";
const MEMORY = 32 * 1024 * 1024;
const VGA_MEMORY = 2 * 1024 * 1024;

/* bytes: the decoded size, which drives the progress bar and the length check. wire: the brotli transfer size measured
   from jsDelivr, shown on the Boot button. */
const files = {
  libv86: { url: `${CDN}libv86.js`, integrity: "sha384-VHM7C9yLVVXL8tfkDmkG6D4ZEwS7DMdJvhMeD1uTYT7J512BkhgQ8Ylp6sUGBDnJ", bytes: 359_857, wire: 96_464 },
  wasm: { url: `${CDN}v86.wasm`, sha256: "2f0c4150f266415b754a84a32e6f8e4c975a1d3abb94c78b047fa30027db1ef1", bytes: 2_007_347, wire: 341_445 },
  wasmFallback: { url: `${CDN}v86-fallback.wasm`, sha256: "4eb64c9b7908d5931c1868eea4824b3a0a628eb86e6eac09d133776b50922d81", bytes: 2_040_034, wire: 0 },
  bios: { url: `${BIOS}seabios.bin`, sha256: "73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98", bytes: 131_072, wire: 60_587 },
  vgaBios: { url: `${BIOS}vgabios.bin`, sha256: "a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880", bytes: 36_352, wire: 14_455 },
  linux: { url: `${IMAGES}linux.iso`, sha256: "b311d065b9acc17e5bf1dd4d12f06e70efaf2f0d8b2c7be3bbbb25076f494885", bytes: 5_666_816, wire: 2_241_455 },
  freedos: { url: `${IMAGES}freedos722.img`, sha256: "6c7b3c62823d538e20797fecae6dc55d2572455791a573a7de2cdba0b583f6be", bytes: 737_280, wire: 571_097 }
};
const runtimeFiles = [files.libv86, files.wasm, files.bios, files.vgaBios];

const guests = {
  linux: {
    name: "Linux",
    image: files.linux,
    prompt: "/root% ",
    /* The root file system is a RAM disk, so a saved state resumes without the CD image. */
    resumeNeedsImage: false,
    options: (image) => (image ? { cdrom: { buffer: image } } : {})
  },
  freedos: {
    name: "FreeDOS",
    image: files.freedos,
    prompt: /^[A-Z]:\\>/,
    resumeNeedsImage: true,
    options: (image) => ({ fda: { buffer: image } })
  }
};

const params = new URLSearchParams(window.location.search);
const jit = params.get("jit") !== "0";
const framed = window.top !== window;
const coarse = window.matchMedia("(pointer: coarse)").matches;

const $ = (id) => document.getElementById(id);
const ui = {
  boot: $("boot"),
  save: $("save"),
  restore: $("restore"),
  forget: $("forget"),
  keyboard: $("keyboard"),
  poweroff: $("poweroff"),
  status: $("status"),
  progress: $("progress"),
  saved: $("saved"),
  screen: $("screen"),
  display: $("screen_container"),
  placeholder: $("placeholder"),
  phoneKeys: $("phone-keys"),
  metrics: $("metrics"),
  newtab: $("newtab"),
  radios: Array.from(document.querySelectorAll('input[name="guest"]'))
};

const metrics = {
  version: V86_VERSION,
  phase: "idle",
  guest: null,
  isolated: window.crossOriginIsolated === true,
  sharedArrayBuffer: typeof SharedArrayBuffer === "function",
  serviceWorker: navigator.serviceWorker?.controller?.scriptURL ?? null,
  framed,
  jit,
  wasm: null,
  downloadedBytes: 0,
  bootInstructions: null,
  bootMips: null,
  mips: null,
  stateBytes: null,
  savedBytes: null,
  timings: {},
  error: null
};

let emulator = null;
let runningGuest = null;
let busy = false;
let bootPending = false;
let runtime = null;
let ticker = 0;
const images = {};
const saves = {};

Object.defineProperty(metrics, "emulator", { get: () => emulator, enumerable: false });
window.osLab = metrics;

const round = (ms) => Math.round(ms);
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;
const size = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const selectedGuest = () => ui.radios.find((radio) => radio.checked)?.value ?? "linux";
const hex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");

function setPhase(phase, message) {
  metrics.phase = phase;
  document.body.dataset.phase = phase;
  if (message !== undefined) ui.status.textContent = message;
  render();
}

function compatible(meta) {
  return Boolean(meta) && meta.version === V86_VERSION && meta.memory === MEMORY && meta.vgaMemory === VGA_MEMORY;
}

function downloadSize(id, resume = false) {
  const guest = guests[id];
  const needImage = !images[id] && (!resume || guest.resumeNeedsImage);
  return (runtime?.ready ? 0 : runtimeFiles.reduce((sum, file) => sum + file.wire, 0)) + (needImage ? guest.image.wire : 0);
}

function render() {
  const id = selectedGuest();
  const guest = guests[id];
  const meta = saves[id];
  const sameGuest = runningGuest === id;
  const bootBytes = downloadSize(id);
  ui.boot.textContent = bootBytes ? `Boot ${guest.name} · ${size(bootBytes)} download` : `Boot ${guest.name}`;
  ui.boot.disabled = busy || Boolean(emulator);
  ui.save.disabled = busy || !emulator;
  ui.poweroff.disabled = busy || !emulator;
  ui.forget.disabled = busy || !meta;
  ui.restore.disabled = busy || !compatible(meta) || (Boolean(emulator) && !sameGuest);
  const resumeBytes = downloadSize(id, true);
  ui.restore.textContent = sameGuest ? "Restore" : resumeBytes ? `Resume save · ${size(resumeBytes)} download` : "Resume save";
  ui.keyboard.hidden = !coarse || !emulator;
  for (const radio of ui.radios) radio.disabled = busy || Boolean(emulator);
  if (!meta) ui.saved.textContent = "";
  else if (!compatible(meta)) ui.saved.textContent = `The ${guest.name} save is from another emulator version and can't be restored.`;
  else ui.saved.textContent = `${guest.name} save: ${size(meta.storedBytes)} in this browser, from ${new Date(meta.savedAt).toLocaleString()}.`;
  renderMetrics();
}

function renderMetrics() {
  const t = metrics.timings;
  const rows = [
    ["Cross-origin isolated", metrics.isolated ? "yes" : "no"],
    ["SharedArrayBuffer", metrics.sharedArrayBuffer ? "available" : "not available"],
    ["Service worker", metrics.serviceWorker ? "controlling this page" : "none"],
    ["In a frame", framed ? "yes" : "no"],
    ["JIT", jit ? "on" : "off (?jit=0)"],
    ["WebAssembly module", metrics.wasm ?? "not loaded"],
    ["Downloaded (decoded)", metrics.downloadedBytes ? size(metrics.downloadedBytes) : "nothing"],
    ["Download time", t.download != null ? seconds(t.download) : "–"],
    ["Emulator start", t.start != null ? `${t.start} ms` : "–"],
    ["Boot to prompt", t.bootToPrompt != null ? seconds(t.bootToPrompt) : "–"],
    ["Boot to prompt from click", t.coldBoot != null ? seconds(t.coldBoot) : "–"],
    ["Boot speed", metrics.bootMips != null ? `${metrics.bootMips} MIPS (${(metrics.bootInstructions / 1e6).toFixed(0)}M instructions)` : "–"],
    ["Speed now", metrics.mips != null ? `${metrics.mips} MIPS` : "–"],
    ["Save", t.save != null ? `${t.save} ms snapshot + ${t.compress} ms gzip + ${t.store} ms IndexedDB` : "–"],
    ["Save size", metrics.stateBytes != null ? `${size(metrics.stateBytes)} raw, ${size(metrics.savedBytes)} stored` : "–"],
    ["Restore (running)", t.restore != null ? `${t.restore} ms` : "–"],
    ["Resume (from click)", t.resume != null ? `${t.resume} ms` : "–"]
  ];
  ui.metrics.replaceChildren(...rows.flatMap(([label, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    return [dt, dd];
  }));
}

function loadScript(file) {
  if (window.V86) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = file.url;
    script.integrity = file.integrity;
    script.crossOrigin = "anonymous";
    script.onload = () => (window.V86 ? resolve() : reject(new Error("v86 loaded but did not define V86")));
    script.onerror = () => {
      script.remove();
      reject(new Error(`Couldn't load ${file.url}`));
    };
    document.head.append(script);
  });
}

async function download(file, onBytes) {
  const response = await fetch(file.url, { credentials: "omit" });
  if (!response.ok) throw new Error(`${file.url} answered ${response.status}`);
  const out = new Uint8Array(file.bytes);
  let offset = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > out.byteLength) throw new Error(`${file.url} is larger than expected; it may have changed upstream.`);
    out.set(value, offset);
    offset += value.byteLength;
    onBytes(value.byteLength);
  }
  if (offset !== file.bytes) throw new Error(`${file.url} is ${offset} bytes, expected ${file.bytes}.`);
  if (hex(await crypto.subtle.digest("SHA-256", out)) !== file.sha256) {
    throw new Error(`${file.url} doesn't match its pinned SHA-256; it may have changed upstream.`);
  }
  metrics.downloadedBytes += offset;
  return out.buffer;
}

function loadRuntime(onBytes) {
  if (!runtime) {
    const promise = Promise.all([
      loadScript(files.libv86).then(() => onBytes(files.libv86.bytes)),
      download(files.wasm, onBytes),
      download(files.bios, onBytes),
      download(files.vgaBios, onBytes)
    ]).then(([, wasm, bios, vgaBios]) => {
      metrics.downloadedBytes += files.libv86.bytes;
      runtime = { ready: true, wasm, bios, vgaBios };
      return runtime;
    }, (error) => {
      runtime = null;
      throw error;
    });
    runtime = { ready: false, promise };
  }
  return runtime.ready ? Promise.resolve(runtime) : runtime.promise;
}

async function loadImage(id, onBytes) {
  images[id] ??= await download(guests[id].image, onBytes);
  return images[id];
}

function tracker(id, label, needed) {
  const total = needed.reduce((sum, file) => sum + file.bytes, 0);
  let loaded = 0;
  ui.progress.hidden = total === 0;
  ui.progress.value = 0;
  if (total) ui.status.textContent = `${label} ${guests[id].name}: downloading…`;
  return (bytes) => {
    loaded += bytes;
    ui.progress.value = Math.min(1, loaded / total);
    ui.status.textContent = `${label} ${guests[id].name}: downloading ${Math.min(100, Math.floor((100 * loaded) / total))}%`;
  };
}

async function instantiateWasm(imports) {
  try {
    const { instance } = await WebAssembly.instantiate(runtime.wasm, imports);
    metrics.wasm = "v86.wasm";
    return instance.exports;
  } catch (error) {
    console.warn("v86.wasm failed to start; trying v86-fallback.wasm", error);
    const fallback = await download(files.wasmFallback, () => {});
    const { instance } = await WebAssembly.instantiate(fallback, imports);
    metrics.wasm = "v86-fallback.wasm";
    return instance.exports;
  }
}

function waitFor(emu, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The emulator didn't start within ${timeoutMs / 1000} s.`)), timeoutMs);
    emu.add_listener(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const keyboardFocused = () => document.activeElement === ui.screen || document.activeElement === ui.phoneKeys;

function syncKeyboard() {
  emulator?.keyboard_set_enabled(keyboardFocused());
}

function createEmulator(id, image, initialState) {
  const emu = new window.V86({
    wasm_fn: instantiateWasm,
    memory_size: MEMORY,
    vga_memory_size: VGA_MEMORY,
    screen_container: ui.display,
    bios: { buffer: runtime.bios },
    vga_bios: { buffer: runtime.vgaBios },
    /* The emulator writes to a floppy image, so it gets a copy and a later boot starts from the pristine download. */
    ...guests[id].options(image ? image.slice(0) : undefined),
    initial_state: initialState ? { buffer: initialState } : undefined,
    autostart: true,
    disable_jit: !jit,
    disable_mouse: true,
    disable_speaker: true,
    log_level: 0
  });
  /* The keyboard adapter listens on the whole window and starts enabled, so it is switched off until the screen has focus. */
  emu.add_listener("emulator-ready", syncKeyboard);
  emu.add_listener("emulator-started", syncKeyboard);
  emulator = emu;
  runningGuest = id;
  metrics.guest = id;
  ui.placeholder.hidden = true;
  ui.display.hidden = false;
  startTicker(emu);
  return emu;
}

function startTicker(emu) {
  clearInterval(ticker);
  let last = { count: emu.get_instruction_counter(), at: performance.now() };
  ticker = setInterval(() => {
    if (emu !== emulator) return;
    const now = { count: emu.get_instruction_counter(), at: performance.now() };
    metrics.mips = Math.round((((now.count - last.count) >>> 0) / (now.at - last.at)) / 1000);
    last = now;
    renderMetrics();
  }, 1000);
}

function focusScreen() {
  if (!keyboardFocused() && (document.activeElement === document.body || document.activeElement?.closest(".lab__bar"))) {
    ui.screen.focus({ preventScroll: true });
  }
}

function fail(error) {
  console.error(error);
  metrics.error = error instanceof Error ? error.message : String(error);
  ui.progress.hidden = true;
  setPhase("error", `Something went wrong: ${metrics.error} Check your connection, or whether a filter blocks cdn.jsdelivr.net, then try again.`);
}

async function boot() {
  const id = selectedGuest();
  const guest = guests[id];
  const clickAt = performance.now();
  busy = true;
  metrics.error = null;
  metrics.timings = {};
  metrics.bootInstructions = metrics.bootMips = null;
  let emu;
  let bootAt;
  try {
    setPhase("downloading", `Booting ${guest.name}…`);
    const needed = [...(runtime?.ready ? [] : runtimeFiles), ...(images[id] ? [] : [guest.image])];
    const track = tracker(id, "Booting", needed);
    const [, image] = await Promise.all([loadRuntime(track), loadImage(id, track)]);
    ui.progress.hidden = true;
    metrics.timings.download = round(performance.now() - clickAt);
    setPhase("starting", "Starting the emulator…");
    const startAt = performance.now();
    emu = createEmulator(id, image);
    await waitFor(emu, "emulator-started", 60_000);
    bootAt = performance.now();
    metrics.timings.start = round(bootAt - startAt);
  } catch (error) {
    await powerOff(true);
    busy = false;
    fail(error);
    return;
  }
  busy = false;
  if (emu !== emulator) return render();
  bootPending = true;
  setPhase("booting", `Booting ${guest.name}…`);
  focusScreen();
  const found = await emu.wait_until_vga_screen_contains(guest.prompt, { timeout_msec: 180_000 });
  if (emu !== emulator || !bootPending) return;
  bootPending = false;
  if (!found) {
    setPhase("running", `${guest.name} is running, but no prompt appeared within 3 minutes.`);
    return;
  }
  const readyAt = performance.now();
  metrics.timings.bootToPrompt = round(readyAt - bootAt);
  metrics.timings.coldBoot = round(readyAt - clickAt);
  metrics.bootInstructions = emu.get_instruction_counter();
  metrics.bootMips = Math.round(metrics.bootInstructions / (readyAt - bootAt) / 1000);
  const message = `${guest.name} is up: prompt ${seconds(readyAt - bootAt)} after start, ${seconds(readyAt - clickAt)} after you pressed Boot.`;
  /* A save started during boot reports its own result, then switches to "running". */
  if (metrics.phase === "booting") setPhase("running", message);
  else renderMetrics();
}

async function powerOff(quiet = false) {
  const emu = emulator;
  if (!emu) return;
  emulator = null;
  runningGuest = null;
  bootPending = false;
  clearInterval(ticker);
  metrics.mips = null;
  try {
    await emu.destroy();
  } catch (error) {
    console.warn(error);
  }
  ui.display.querySelector("div")?.replaceChildren();
  ui.display.hidden = true;
  ui.placeholder.hidden = false;
  ui.placeholder.textContent = "Powered off.";
  if (!quiet) setPhase("off", "Powered off. Boot again, or resume a save.");
}

/* IndexedDB keeps the small metadata apart from the multi-megabyte state, so listing saves doesn't read the states. */
let database;
function db() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("os-lab", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("meta");
      request.result.createObjectStore("data");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

const result = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const completion = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error ?? new Error("The save was aborted."));
});

async function readSaves() {
  try {
    const store = (await db()).transaction("meta").objectStore("meta");
    for (const id of Object.keys(guests)) saves[id] = (await result(store.get(id))) ?? null;
  } catch (error) {
    console.warn("IndexedDB is unavailable", error);
  }
  render();
}

const canCompress = typeof CompressionStream === "function" && typeof DecompressionStream === "function";
const transform = (buffer, stream) => new Response(new Blob([buffer]).stream().pipeThrough(stream)).arrayBuffer();

async function save() {
  const emu = emulator;
  const id = runningGuest;
  if (!emu || !id) return;
  busy = true;
  setPhase("saving", `Saving ${guests[id].name}…`);
  const after = () => (bootPending ? "booting" : "running");
  try {
    const t0 = performance.now();
    const state = await emu.save_state();
    const t1 = performance.now();
    const data = canCompress ? await transform(state, new CompressionStream("gzip")) : state;
    const t2 = performance.now();
    const meta = {
      guest: id,
      version: V86_VERSION,
      memory: MEMORY,
      vgaMemory: VGA_MEMORY,
      encoding: canCompress ? "gzip" : "raw",
      stateBytes: state.byteLength,
      storedBytes: data.byteLength,
      savedAt: Date.now()
    };
    const transaction = (await db()).transaction(["meta", "data"], "readwrite");
    transaction.objectStore("data").put(data, id);
    transaction.objectStore("meta").put(meta, id);
    await completion(transaction);
    const t3 = performance.now();
    saves[id] = meta;
    Object.assign(metrics.timings, { save: round(t1 - t0), compress: round(t2 - t1), store: round(t3 - t2) });
    metrics.stateBytes = state.byteLength;
    metrics.savedBytes = data.byteLength;
    setPhase(after(), `Saved ${guests[id].name}: ${size(data.byteLength)} in ${seconds(t3 - t0)}.`);
  } catch (error) {
    console.error(error);
    const full = error?.name === "QuotaExceededError";
    setPhase(after(), full ? "Couldn't save: this browser's storage for the site is full." : `Couldn't save: ${error?.message ?? error}`);
  } finally {
    busy = false;
    render();
  }
}

async function readState(id) {
  const meta = saves[id];
  const data = await result((await db()).transaction("data").objectStore("data").get(id));
  if (!data) throw new Error("The saved state is missing.");
  return meta.encoding === "gzip" ? transform(data, new DecompressionStream("gzip")) : data;
}

async function restore() {
  const id = selectedGuest();
  const guest = guests[id];
  if (!compatible(saves[id])) return;
  const clickAt = performance.now();
  const inPlace = Boolean(emulator) && runningGuest === id;
  busy = true;
  metrics.error = null;
  try {
    if (inPlace) {
      setPhase("restoring", `Restoring ${guest.name}…`);
      const state = await readState(id);
      await emulator.restore_state(state);
      bootPending = false;
      metrics.timings.restore = round(performance.now() - clickAt);
      setPhase("running", `Restored ${guest.name} in ${metrics.timings.restore} ms.`);
      return;
    }
    metrics.timings = {};
    setPhase("downloading", `Resuming ${guest.name}…`);
    const needed = [...(runtime?.ready ? [] : runtimeFiles), ...(guest.resumeNeedsImage && !images[id] ? [guest.image] : [])];
    const track = tracker(id, "Resuming", needed);
    const [state, , image] = await Promise.all([
      readState(id),
      loadRuntime(track),
      guest.resumeNeedsImage ? loadImage(id, track) : undefined
    ]);
    ui.progress.hidden = true;
    metrics.timings.download = round(performance.now() - clickAt);
    setPhase("restoring", `Restoring ${guest.name}…`);
    const emu = createEmulator(id, image, state);
    await waitFor(emu, "emulator-started", 60_000);
    if (emu !== emulator) return;
    metrics.timings.resume = round(performance.now() - clickAt);
    setPhase("running", `Resumed ${guest.name} in ${seconds(metrics.timings.resume)}.`);
    focusScreen();
  } catch (error) {
    console.error(error);
    if (inPlace && emulator) {
      setPhase("running", `Couldn't restore the save: ${error?.message ?? error}`);
    } else {
      await powerOff(true);
      fail(error);
    }
  } finally {
    busy = false;
    render();
  }
}

async function forget() {
  const id = selectedGuest();
  busy = true;
  render();
  try {
    const transaction = (await db()).transaction(["meta", "data"], "readwrite");
    transaction.objectStore("data").delete(id);
    transaction.objectStore("meta").delete(id);
    await completion(transaction);
    saves[id] = null;
    ui.status.textContent = `Deleted the ${guests[id].name} save.`;
  } catch (error) {
    ui.status.textContent = `Couldn't delete the save: ${error?.message ?? error}`;
  } finally {
    busy = false;
    render();
  }
}

/* Modifier break codes (shift, ctrl, alt, right ctrl, right alt), so a key held while focus leaves doesn't stick. */
const releaseModifiers = [0xaa, 0xb6, 0x9d, 0xb8, 0xe0, 0x9d, 0xe0, 0xb8];

function onKeyboardFocus() {
  syncKeyboard();
}

function onKeyboardBlur() {
  if (!emulator) return;
  if (!keyboardFocused()) emulator.keyboard_send_scancodes(releaseModifiers);
  syncKeyboard();
}

/* Tab belongs to the guest (shell completion), so Shift+Tab is the way out of the screen. Stopping the event in the
   capture phase keeps it from v86's window listener, and the browser then moves focus as usual. */
window.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && event.shiftKey && document.activeElement === ui.screen) event.stopImmediatePropagation();
}, true);

ui.screen.addEventListener("focus", onKeyboardFocus);
ui.screen.addEventListener("blur", onKeyboardBlur);
ui.phoneKeys.addEventListener("focus", onKeyboardFocus);
ui.phoneKeys.addEventListener("blur", onKeyboardBlur);

/* A soft keyboard sends text through input events. The field keeps a few characters so backspace still has something
   to delete, and v86 reads the typed text from the event rather than the field. */
const keySentinel = "....";
ui.phoneKeys.value = keySentinel;
ui.phoneKeys.addEventListener("input", () => {
  ui.phoneKeys.value = keySentinel;
});

ui.screen.addEventListener("click", () => {
  if (coarse && emulator) ui.phoneKeys.focus({ preventScroll: true });
});
ui.keyboard.addEventListener("click", () => ui.phoneKeys.focus({ preventScroll: true }));
ui.boot.addEventListener("click", boot);
ui.save.addEventListener("click", save);
ui.restore.addEventListener("click", restore);
ui.forget.addEventListener("click", forget);
ui.poweroff.addEventListener("click", () => powerOff());
for (const radio of ui.radios) radio.addEventListener("change", render);

const requested = params.get("guest");
if (requested && guests[requested]) ui.radios.forEach((radio) => (radio.checked = radio.value === requested));

if (framed) {
  ui.newtab.hidden = false;
  ui.newtab.href = window.location.href;
  /* Lab OS can't see clicks inside its windows' frames, so the page asks it to focus this window. */
  document.addEventListener("pointerdown", () => window.parent.postMessage({ type: "labos:focus" }, window.location.origin), true);
}

ui.display.hidden = true;

/* The screen keeps its shape, so in a short viewport (such as a Lab OS window) it narrows until it fits the height. */
function fitScreen() {
  const room = window.innerHeight - (ui.screen.getBoundingClientRect().top + window.scrollY) - 12;
  ui.screen.style.maxWidth = `${Math.max(320, Math.floor(room * 1.6))}px`;
}
const fitObserver = new ResizeObserver(fitScreen);
for (const element of document.querySelectorAll(".lab__head, .lab__guests, .lab__bar, .lab__status, .lab__progress, .lab__saved")) fitObserver.observe(element);
window.addEventListener("resize", fitScreen);

render();
readSaves();
