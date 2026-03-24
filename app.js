const tg = window.Telegram?.WebApp || null;
const WORKER_BASE_URL = "https://frosty-hall-66b2.7570745.workers.dev";

// Global DOM
const tabButtons = document.querySelectorAll(".tab-item");
const tabPanels = document.querySelectorAll(".tab-panel");

// Running Tab State
let activeRunMode = "conv"; // default
let lastEditedConvSource = "pace"; // tracks which converter field was edited last ('pace' or 'speed')
let activeTargetDist = null;

// UX Helpers
function showError(boxId, textId, errorObj) {
  const box = document.getElementById(boxId);
  const text = document.getElementById(textId);
  text.textContent = errorObj.message;
  box.classList.remove("hidden");
  errorObj.fields.forEach(id => document.getElementById(id)?.classList.add("input-error"));
}

function clearErrors() {
  document.querySelectorAll(".error-box").forEach(box => box.classList.add("hidden"));
  document.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
}

function triggerUpdateAnimation(selector) {
  document.querySelectorAll(selector).forEach(el => {
    el.classList.remove("update-flash");
    void el.offsetWidth;
    el.classList.add("update-flash");
  });
}

function scrollToElement(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.bottom > window.innerHeight || rect.top < 0) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function parsePositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

// Tabs Binding
function switchTab(tabName) {
  tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabName));
  tabPanels.forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tabName}`));
  syncMainButton();
}

function syncMainButton() {
  if (!tg?.MainButton) return;
  tg.MainButton.setText("РАССЧИТАТЬ");
  tg.MainButton.show();
  tg.MainButton.enable();
}

// Calories Logic
function validateCaloriesForm() {
  const age = parsePositiveNumber(document.getElementById("age").value);
  const height = parsePositiveNumber(document.getElementById("height").value);
  const weight = parsePositiveNumber(document.getElementById("weight").value);
  const fields = [];
  if (!age) fields.push("age");
  if (!height) fields.push("height");
  if (!weight) fields.push("weight");
  if (fields.length > 0) return { message: "Заполните все поля", fields };
  if (age < 1 || age > 120) return { message: "Возраст: 1–120 лет", fields: ["age"] };
  if (height < 50 || height > 300) return { message: "Рост: 50–300 см", fields: ["height"] };
  if (weight < 20 || weight > 500) return { message: "Вес: 20–500 кг", fields: ["weight"] };
  return null;
}

function calculateCalories() {
  clearErrors();
  const errorObj = validateCaloriesForm();
  if (errorObj) return showError("error-box", "error-text", errorObj);

  const sex = document.getElementById("sex").value;
  const age = parsePositiveNumber(document.getElementById("age").value);
  const height = parsePositiveNumber(document.getElementById("height").value);
  const weight = parsePositiveNumber(document.getElementById("weight").value);
  const activity = Number(document.getElementById("activity").value);

  let bmr = 10 * weight + 6.25 * height - 5 * age;
  bmr = sex === "male" ? bmr + 5 : bmr - 161;
  const maintain = Math.round(bmr * activity);

  document.getElementById("bmr-value").textContent = String(Math.round(bmr));
  document.getElementById("maintain-value").textContent = String(maintain);
  document.getElementById("cut-value").textContent = String(Math.round(maintain * 0.85));
  document.getElementById("bulk-value").textContent = String(Math.round(maintain * 1.15));

  updateMacros(maintain, weight);
  triggerUpdateAnimation("#result .m-value, .macro-panel.active strong");
  scrollToElement("result");
}

function updateMacros(maintainKcal, weight) {
  const goals = {
    cut: { kcal: Math.round(maintainKcal * 0.85), p: 2.2, f: 0.8 },
    maintain: { kcal: maintainKcal, p: 2.0, f: 0.9 },
    bulk: { kcal: Math.round(maintainKcal * 1.15), p: 1.8, f: 1.0 }
  };
  let hasLowCarb = false;
  Object.keys(goals).forEach(key => {
    const p = Math.round(weight * goals[key].p);
    const f = Math.round(weight * goals[key].f);
    const pKcal = p * 4; const fKcal = f * 9;
    const c = Math.round(Math.max(0, goals[key].kcal - (pKcal + fKcal)) / 4);
    const cKcal = c * 4;
    const t = pKcal + fKcal + cKcal;
    if (c < 50) hasLowCarb = true;

    document.getElementById(`${key}-protein`).textContent = `${p} г`;
    document.getElementById(`${key}-fat`).textContent = `${f} г`;
    document.getElementById(`${key}-carbs`).textContent = `${c} г`;
    
    document.getElementById(`${key}-p-details`).innerHTML = `${t>0?Math.round(pKcal/t*100):0}% &bull; ${pKcal} ккал`;
    document.getElementById(`${key}-f-details`).innerHTML = `${t>0?Math.round(fKcal/t*100):0}% &bull; ${fKcal} ккал`;
    document.getElementById(`${key}-c-details`).innerHTML = `${t>0?Math.round(cKcal/t*100):0}% &bull; ${cKcal} ккал`;
  });
  document.getElementById("macros-warning").classList.toggle("hidden", !hasLowCarb);
}

// Running Logic
function bindRunningSlicers() {
  document.querySelectorAll(".macro-slicer[data-run-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".macro-slicer[data-run-mode]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeRunMode = btn.dataset.runMode;
      
      document.getElementById("run-mode-fact").classList.add("hidden");
      document.getElementById("run-mode-target").classList.add("hidden");
      document.getElementById("run-mode-conv").classList.add("hidden");
      document.getElementById(`run-mode-${activeRunMode}`).classList.remove("hidden");
      
      clearErrors();
    });
  });

  // Target Chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeTargetDist = chip.dataset.val;
      document.getElementById("target-custom-dist").classList.toggle("hidden", activeTargetDist !== "custom");
    });
  });

  // Converter Listeners (to track intent & auto-calc)
  const convPaceMin = document.getElementById("conv-pace-min");
  const convPaceSec = document.getElementById("conv-pace-sec");
  const convSpeed = document.getElementById("conv-speed");

  const onPaceInput = () => { lastEditedConvSource = "pace"; handleAutoCalcConv(); };
  const onSpeedInput = () => { lastEditedConvSource = "speed"; handleAutoCalcConv(); };

  convPaceMin.addEventListener("input", onPaceInput);
  convPaceSec.addEventListener("input", onPaceInput);
  convSpeed.addEventListener("input", onSpeedInput);
}

function normalizeTime(h, m, s) {
  if (s >= 60) { m += Math.floor(s / 60); s = s % 60; }
  if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
  return { h, m, s };
}

function formatPace(totalSecondsPerKm) {
  let m = Math.floor(totalSecondsPerKm / 60);
  let s = Math.round(totalSecondsPerKm % 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// 1. Fact Mode
function calcFact() {
  let s = parsePositiveNumber(document.getElementById("fact-seconds").value);
  let m = parsePositiveNumber(document.getElementById("fact-minutes").value);
  let h = parsePositiveNumber(document.getElementById("fact-hours").value);
  let mt = parsePositiveNumber(document.getElementById("fact-meters").value);
  let km = parsePositiveNumber(document.getElementById("fact-km").value);

  const t = normalizeTime(h, m, s);
  if (t.s || document.getElementById("fact-seconds").value) document.getElementById("fact-seconds").value = t.s || "";
  if (t.m || document.getElementById("fact-minutes").value) document.getElementById("fact-minutes").value = t.m || "";
  if (t.h || document.getElementById("fact-hours").value) document.getElementById("fact-hours").value = t.h || "";
  if (mt >= 1000) { km += Math.floor(mt / 1000); mt = mt % 1000; }
  if (mt || document.getElementById("fact-meters").value) document.getElementById("fact-meters").value = mt || "";
  if (km || document.getElementById("fact-km").value) document.getElementById("fact-km").value = km || "";

  const totalSec = t.h * 3600 + t.m * 60 + t.s;
  const totalKm = km + mt / 1000;

  if (totalSec <= 0 && totalKm <= 0) return showError("running-error-box", "running-error-text", { message: "Укажите время и дистанцию", fields: ["fact-hours", "fact-km"] });
  if (totalSec <= 0) return showError("running-error-box", "running-error-text", { message: "Укажите время бега", fields: ["fact-minutes"] });
  if (totalKm <= 0) return showError("running-error-box", "running-error-text", { message: "Укажите дистанцию", fields: ["fact-km"] });

  const paceSec = totalSec / totalKm;
  const speed = totalKm / (totalSec / 3600);

  document.getElementById("res-pace-value").textContent = formatPace(paceSec);
  document.getElementById("res-speed-value").textContent = speed.toFixed(2);

  [ { id: "pred-1k", km: 1 }, { id: "pred-3k", km: 3 }, { id: "pred-5k", km: 5 }, { id: "pred-10k", km: 10 }, { id: "pred-21k", km: 21.0975 } ]
    .forEach(d => document.getElementById(d.id).textContent = formatTime(paceSec * d.km));

  document.getElementById("run-metrics-standard").classList.remove("hidden");
  document.getElementById("run-metrics-conv").classList.add("hidden");
  document.getElementById("predictions-block").classList.remove("hidden");
}

// 2. Target Mode
function calcTarget() {
  if (!activeTargetDist) return showError("running-error-box", "running-error-text", { message: "Выберите дистанцию", fields: [] });

  let totalKm = 0;
  if (activeTargetDist === "custom") {
    let km = parsePositiveNumber(document.getElementById("target-km").value);
    let mt = parsePositiveNumber(document.getElementById("target-meters").value);
    if (mt >= 1000) { km += Math.floor(mt / 1000); mt = mt % 1000; }
    if (mt || document.getElementById("target-meters").value) document.getElementById("target-meters").value = mt || "";
    if (km || document.getElementById("target-km").value) document.getElementById("target-km").value = km || "";
    totalKm = km + mt / 1000;
  } else {
    totalKm = parseFloat(activeTargetDist);
  }

  let s = parsePositiveNumber(document.getElementById("target-seconds").value);
  let m = parsePositiveNumber(document.getElementById("target-minutes").value);
  let h = parsePositiveNumber(document.getElementById("target-hours").value);
  const t = normalizeTime(h, m, s);
  
  if (t.s || document.getElementById("target-seconds").value) document.getElementById("target-seconds").value = t.s || "";
  if (t.m || document.getElementById("target-minutes").value) document.getElementById("target-minutes").value = t.m || "";
  if (t.h || document.getElementById("target-hours").value) document.getElementById("target-hours").value = t.h || "";

  const totalSec = t.h * 3600 + t.m * 60 + t.s;

  if (totalKm <= 0) return showError("running-error-box", "running-error-text", { message: "Укажите дистанцию", fields: ["target-km"] });
  if (totalSec <= 0) return showError("running-error-box", "running-error-text", { message: "Укажите желаемое время", fields: ["target-minutes"] });

  const paceSec = totalSec / totalKm;
  const speed = totalKm / (totalSec / 3600);

  document.getElementById("res-pace-value").textContent = formatPace(paceSec);
  document.getElementById("res-speed-value").textContent = speed.toFixed(2);

  document.getElementById("run-metrics-standard").classList.remove("hidden");
  document.getElementById("run-metrics-conv").classList.add("hidden");
  document.getElementById("predictions-block").classList.add("hidden");
}

// 3. Converter Mode
let convTimeout;
function handleAutoCalcConv() {
  clearTimeout(convTimeout);
  convTimeout = setTimeout(calcConv, 300); // slight debounce for smooth typing
}

function calcConv() {
  clearErrors();
  const vLabel = document.getElementById("conv-res-label");
  const vMain = document.getElementById("conv-res-value");
  const vUnit = document.getElementById("conv-res-unit");
  const vSub = document.getElementById("conv-res-sub");

  if (lastEditedConvSource === "pace") {
    let m = parsePositiveNumber(document.getElementById("conv-pace-min").value);
    let s = parsePositiveNumber(document.getElementById("conv-pace-sec").value);
    if (!m && !s) return; // Silent return for empty auto-calc

    const t = normalizeTime(0, m, s);
    if (t.s || document.getElementById("conv-pace-sec").value) document.getElementById("conv-pace-sec").value = t.s || "";
    if (t.m || document.getElementById("conv-pace-min").value) document.getElementById("conv-pace-min").value = t.m || "";

    const totalSecPerKm = (t.m * 60) + t.s;
    if (totalSecPerKm <= 0) return;

    const speed = 3600 / totalSecPerKm;
    const speedRounded = (Math.round(speed * 10) / 10).toFixed(1);

    vLabel.textContent = "Скорость";
    vMain.textContent = speed.toFixed(2);
    vUnit.textContent = "км/ч";
    vSub.textContent = `Округленно для дорожки: ${speedRounded}`;
    
  } else {
    let speed = parsePositiveNumber(document.getElementById("conv-speed").value);
    if (!speed) return;

    const totalSecPerKm = 3600 / speed;
    vLabel.textContent = "Темп";
    vMain.textContent = formatPace(totalSecPerKm);
    vUnit.textContent = "мин/км";
    vSub.textContent = "";
  }

  document.getElementById("run-metrics-standard").classList.add("hidden");
  document.getElementById("predictions-block").classList.add("hidden");
  document.getElementById("run-metrics-conv").classList.remove("hidden");
}

// Main Calculate Dispatcher
function calculateRunning() {
  clearErrors();
  if (activeRunMode === "fact") calcFact();
  else if (activeRunMode === "target") calcTarget();
  else if (activeRunMode === "conv") calcConv();

  if (document.querySelectorAll(".error-box.hidden").length > 0) {
    triggerUpdateAnimation(".running-res .m-value");
    scrollToElement("running-result");
  }
}

function handleCalculateAction() {
  const activePanel = document.querySelector(".tab-panel.active")?.id;
  if (activePanel === "tab-calories") calculateCalories();
  else if (activePanel === "tab-running") calculateRunning();
}

function initTelegram() {
  if (!tg) return;
  tg.ready(); tg.expand();
  if (tg.MainButton) { tg.MainButton.setText("РАССЧИТАТЬ"); tg.MainButton.show(); tg.MainButton.onClick(handleCalculateAction); }
}

async function testBackendConnectionSilently() {
  try { await fetch(`${WORKER_BASE_URL}/api/ping`, { method: "GET", headers: { Accept: "application/json" } }); } catch (e) {}
}

function initApp() {
  tabButtons.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  document.querySelectorAll(".macro-slicer:not([data-run-mode])").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".macro-slicer:not([data-run-mode])").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".macro-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`macro-panel-${btn.dataset.macroTab}`).classList.add("active");
    });
  });

  bindRunningSlicers();

  initTelegram();
  syncMainButton();
  testBackendConnectionSilently();
}

window.addEventListener("load", initApp);