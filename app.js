const tg = window.Telegram?.WebApp || null;

// Global DOM
const tabButtons = document.querySelectorAll(".tab-item");
const tabPanels = document.querySelectorAll(".tab-panel");

// Running Tab State
let activeRunMode = "conv"; 
let lastEditedConvSource = "pace"; 
let activeTargetDist = null;
let activeFactDist = null;

// PANO Tab State
let activePanoMode = "direct";
let activeTestInput = "distance";

// Fuel Tab State
let activeFuelActivity = null;
let activeFuelCondition = "moderate";
let activeFuelIntensity = "moderate";

// ============ CONSTANTS ============

const FUEL_GEL_CARBS = 25; // grams per gel
const FUEL_BOTTLE_ML = 500;

// ============ UX HELPERS ============

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

// ============ SHARED FORMAT UTILS ============

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
  let h = Math.floor(totalSeconds / 3600);
  let m = Math.floor((totalSeconds % 3600) / 60);
  let s = Math.round(totalSeconds % 60);
  if (s === 60) { m += 1; s = 0; }
  if (m === 60) { h += 1; m = 0; }
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function parsePaceInput(minId, secId) {
  let m = parsePositiveNumber(document.getElementById(minId).value);
  let s = parsePositiveNumber(document.getElementById(secId).value);
  if (s >= 60) { m += Math.floor(s / 60); s = s % 60; }
  return { min: m, sec: s, total: m * 60 + s };
}

/** Generic clipboard copy with fallback */
function copyToClipboard(text, btn, defaultLabel) {
  const onSuccess = () => {
    btn.textContent = "✓ Скопировано";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = defaultLabel; btn.classList.remove("copied"); }, 2000);
  };
  const onFail = () => {
    btn.textContent = "Не удалось скопировать";
    setTimeout(() => { btn.textContent = defaultLabel; }, 2000);
  };

  navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); onSuccess(); } catch (_) { onFail(); }
    document.body.removeChild(ta);
  });
}

// ============ TABS ============

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

// ============ CALORIES LOGIC ============

function validateCaloriesForm() {
  const age = parsePositiveNumber(document.getElementById("age").value);
  const height = parsePositiveNumber(document.getElementById("height").value);
  const weight = parsePositiveNumber(document.getElementById("weight").value);
  const fields = [];
  if (!age) fields.push("age");
  if (!height) fields.push("height");
  if (!weight) fields.push("weight");
  if (fields.length > 0) return { message: "Заполните все поля", fields };
  if (!Number.isInteger(age)) return { message: "Возраст должен быть целым числом", fields: ["age"] };
  if (age < 18 || age > 100) return { message: "Возраст: 18–100 лет", fields: ["age"] };
  if (height < 100 || height > 250) return { message: "Рост: 100–250 см", fields: ["height"] };
  if (weight < 30 || weight > 300) return { message: "Вес: 30–300 кг", fields: ["weight"] };
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  if (bmi < 10 || bmi > 80) return { message: `Нереалистичное соотношение роста и веса (ИМТ ${bmi.toFixed(1)})`, fields: ["height", "weight"] };
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
  if (bmr <= 0) return showError("error-box", "error-text", { message: "BMR отрицательный — проверьте данные", fields: ["age", "height", "weight"] });

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

// ============ RUNNING LOGIC ============

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

  document.querySelectorAll("#fact-dist-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#fact-dist-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeFactDist = chip.dataset.val;
      document.getElementById("fact-custom-dist").classList.toggle("hidden", activeFactDist !== "custom");
    });
  });

  document.querySelectorAll("#target-dist-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#target-dist-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeTargetDist = chip.dataset.val;
      document.getElementById("target-custom-dist").classList.toggle("hidden", activeTargetDist !== "custom");
    });
  });

  const convPaceMin = document.getElementById("conv-pace-min");
  const convPaceSec = document.getElementById("conv-pace-sec");
  const convSpeed = document.getElementById("conv-speed");
  const onPaceInput = () => { lastEditedConvSource = "pace"; handleAutoCalcConv(); };
  const onSpeedInput = () => { lastEditedConvSource = "speed"; handleAutoCalcConv(); };
  convPaceMin.addEventListener("input", onPaceInput);
  convPaceSec.addEventListener("input", onPaceInput);
  convSpeed.addEventListener("input", onSpeedInput);
}

function calcVO2(velocityMPerMin) { return -4.60 + 0.182258 * velocityMPerMin + 0.000104 * velocityMPerMin * velocityMPerMin; }
function calcPercentVO2max(timeMinutes) { return 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMinutes) + 0.2989558 * Math.exp(-0.1932605 * timeMinutes); }
function calcVDOT(distMeters, timeMinutes) { return calcVO2(distMeters / timeMinutes) / calcPercentVO2max(timeMinutes); }

function predictTime(vdot, distMeters) {
  let lo = 0.5, hi = 1440;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (calcVDOT(distMeters, mid) > vdot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function calcFact() {
  if (!activeFactDist) return showError("running-error-box", "running-error-text", { message: "Выберите дистанцию", fields: [] });
  let s = parsePositiveNumber(document.getElementById("fact-seconds").value);
  let m = parsePositiveNumber(document.getElementById("fact-minutes").value);
  let h = parsePositiveNumber(document.getElementById("fact-hours").value);
  const t = normalizeTime(h, m, s);
  if (t.s || document.getElementById("fact-seconds").value) document.getElementById("fact-seconds").value = t.s || "";
  if (t.m || document.getElementById("fact-minutes").value) document.getElementById("fact-minutes").value = t.m || "";
  if (t.h || document.getElementById("fact-hours").value) document.getElementById("fact-hours").value = t.h || "";

  let totalKm = 0;
  if (activeFactDist === "custom") {
    let km = parsePositiveNumber(document.getElementById("fact-km").value);
    let mt = parsePositiveNumber(document.getElementById("fact-meters").value);
    if (mt >= 1000) { km += Math.floor(mt / 1000); mt = mt % 1000; }
    if (mt || document.getElementById("fact-meters").value) document.getElementById("fact-meters").value = mt || "";
    if (km || document.getElementById("fact-km").value) document.getElementById("fact-km").value = km || "";
    totalKm = km + mt / 1000;
  } else { totalKm = parseFloat(activeFactDist); }

  const totalSec = t.h * 3600 + t.m * 60 + t.s;
  if (totalSec <= 0) return showError("running-error-box", "running-error-text", { message: "Укажите время бега", fields: ["fact-minutes"] });
  if (totalKm <= 0) return showError("running-error-box", "running-error-text", { message: "Укажите дистанцию", fields: ["fact-km"] });

  const paceSec = totalSec / totalKm;
  const paceMinPerKm = paceSec / 60;
  if (paceMinPerKm > 60) return showError("running-error-box", "running-error-text", { message: "Темп > 60 мин/км", fields: ["fact-minutes"] });
  if (paceMinPerKm < 0.5) return showError("running-error-box", "running-error-text", { message: "Темп < 30 сек/км", fields: ["fact-minutes"] });

  const speed = totalKm / (totalSec / 3600);
  document.getElementById("res-pace-value").textContent = formatPace(paceSec);
  document.getElementById("res-speed-value").textContent = speed.toFixed(2);

  const vdot = calcVDOT(totalKm * 1000, totalSec / 60);
  const predDistances = [
    { id: "pred-1k", lossId: "wloss-1k", gainId: "wgain-1k", km: 1 },
    { id: "pred-3k", lossId: "wloss-3k", gainId: "wgain-3k", km: 3 },
    { id: "pred-5k", lossId: "wloss-5k", gainId: "wgain-5k", km: 5 },
    { id: "pred-10k", lossId: "wloss-10k", gainId: "wgain-10k", km: 10 },
    { id: "pred-21k", lossId: "wloss-21k", gainId: "wgain-21k", km: 21.0975 }
  ];
  predDistances.forEach(d => { document.getElementById(d.id).textContent = formatTime(predictTime(vdot, d.km * 1000) * 60); });

  const weight = parsePositiveNumber(document.getElementById("fact-weight").value);
  const hasWeight = weight >= 30 && weight <= 300;
  if (hasWeight) {
    const vdotLoss = vdot * (weight / (weight - 5));
    const vdotGain = vdot * (weight / (weight + 5));
    predDistances.forEach(d => {
      document.getElementById(d.lossId).textContent = formatTime(predictTime(vdotLoss, d.km * 1000) * 60);
      document.getElementById(d.gainId).textContent = formatTime(predictTime(vdotGain, d.km * 1000) * 60);
    });
    document.getElementById("weight-loss-block").classList.remove("hidden");
    document.getElementById("weight-gain-block").classList.remove("hidden");
  } else {
    document.getElementById("weight-loss-block").classList.add("hidden");
    document.getElementById("weight-gain-block").classList.add("hidden");
  }
  document.getElementById("run-metrics-standard").classList.remove("hidden");
  document.getElementById("run-metrics-conv").classList.add("hidden");
  document.getElementById("predictions-block").classList.remove("hidden");
}

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
  } else { totalKm = parseFloat(activeTargetDist); }

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
  document.getElementById("weight-loss-block").classList.add("hidden");
  document.getElementById("weight-gain-block").classList.add("hidden");
}

let convTimeout;
function handleAutoCalcConv() { clearTimeout(convTimeout); convTimeout = setTimeout(calcConv, 300); }

function calcConv() {
  clearErrors();
  const vLabel = document.getElementById("conv-res-label");
  const vMain = document.getElementById("conv-res-value");
  const vUnit = document.getElementById("conv-res-unit");
  const vSub = document.getElementById("conv-res-sub");

  if (lastEditedConvSource === "pace") {
    let m = parsePositiveNumber(document.getElementById("conv-pace-min").value);
    let s = parsePositiveNumber(document.getElementById("conv-pace-sec").value);
    if (!m && !s) return;
    if (s >= 60) { m += Math.floor(s / 60); s = s % 60; }
    if (s || document.getElementById("conv-pace-sec").value) document.getElementById("conv-pace-sec").value = s || "";
    if (m || document.getElementById("conv-pace-min").value) document.getElementById("conv-pace-min").value = m || "";
    const totalSecPerKm = m * 60 + s;
    if (totalSecPerKm <= 0 || totalSecPerKm < 30 || totalSecPerKm > 3600) return;
    const speed = 3600 / totalSecPerKm;
    vLabel.textContent = "Скорость"; vMain.textContent = speed.toFixed(2); vUnit.textContent = "км/ч";
    vSub.textContent = `Округленно для дорожки: ${(Math.round(speed * 10) / 10).toFixed(1)}`;
  } else {
    let speed = parsePositiveNumber(document.getElementById("conv-speed").value);
    if (!speed || speed > 120 || speed < 1) return;
    const totalSecPerKm = 3600 / speed;
    vLabel.textContent = "Темп"; vMain.textContent = formatPace(totalSecPerKm); vUnit.textContent = "мин/км"; vSub.textContent = "";
  }
  document.getElementById("run-metrics-standard").classList.add("hidden");
  document.getElementById("predictions-block").classList.add("hidden");
  document.getElementById("weight-loss-block").classList.add("hidden");
  document.getElementById("weight-gain-block").classList.add("hidden");
  document.getElementById("run-metrics-conv").classList.remove("hidden");
}

function calculateRunning() {
  clearErrors();
  if (activeRunMode === "fact") calcFact();
  else if (activeRunMode === "target") calcTarget();
  else if (activeRunMode === "conv") calcConv();
  if (document.getElementById("running-error-box").classList.contains("hidden")) {
    triggerUpdateAnimation(".running-res .m-value");
    scrollToElement("running-result");
  }
}

// ============ PANO MODULE ============

const PANO_MIN_PACE = 90;
const PANO_MAX_PACE = 900;
const PANO_MIN_HR = 100;
const PANO_MAX_HR = 220;

function bindPanoSlicers() {
  document.querySelectorAll(".macro-slicer[data-pano-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".macro-slicer[data-pano-mode]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activePanoMode = btn.dataset.panoMode;
      document.getElementById("pano-mode-direct").classList.toggle("hidden", activePanoMode !== "direct");
      document.getElementById("pano-mode-test").classList.toggle("hidden", activePanoMode !== "test");
      clearErrors();
    });
  });
  document.querySelectorAll(".macro-slicer[data-test-input]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".macro-slicer[data-test-input]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTestInput = btn.dataset.testInput;
      document.getElementById("test-distance-input").classList.toggle("hidden", activeTestInput !== "distance");
      document.getElementById("test-pace-input").classList.toggle("hidden", activeTestInput !== "pace");
    });
  });
  const hintBtn = document.getElementById("pano-hint-btn");
  const hintBody = document.getElementById("pano-hint-body");
  if (hintBtn && hintBody) {
    hintBtn.addEventListener("click", () => { hintBody.classList.toggle("hidden"); hintBtn.classList.toggle("expanded"); });
  }
  document.getElementById("pano-copy-btn")?.addEventListener("click", () => {
    copyToClipboard(buildPanoResultText(), document.getElementById("pano-copy-btn"), "Скопировать результат");
  });
}

function calculatePano() {
  clearErrors();
  let thresholdPaceSec, lthr;

  if (activePanoMode === "direct") {
    const pace = parsePaceInput("pano-pace-min", "pano-pace-sec");
    thresholdPaceSec = pace.total;
    lthr = parsePositiveNumber(document.getElementById("pano-hr").value);
    if (thresholdPaceSec <= 0) return showError("pano-error-box", "pano-error-text", { message: "Укажите пороговый темп", fields: ["pano-pace-min", "pano-pace-sec"] });
    if (thresholdPaceSec < PANO_MIN_PACE || thresholdPaceSec > PANO_MAX_PACE) return showError("pano-error-box", "pano-error-text", { message: "Темп: 1:30 – 15:00 мин/км", fields: ["pano-pace-min"] });
    if (!lthr || lthr < PANO_MIN_HR || lthr > PANO_MAX_HR) return showError("pano-error-box", "pano-error-text", { message: "Пульс: 100–220 уд/мин", fields: ["pano-hr"] });
  } else {
    if (activeTestInput === "distance") {
      const dist = parsePositiveNumber(document.getElementById("test-dist").value);
      if (!dist) return showError("pano-error-box", "pano-error-text", { message: "Укажите дистанцию", fields: ["test-dist"] });
      if (dist < 1 || dist > 15) return showError("pano-error-box", "pano-error-text", { message: "Дистанция: 1–15 км", fields: ["test-dist"] });
      thresholdPaceSec = 1800 / dist;
    } else {
      const pace = parsePaceInput("test-pace-min", "test-pace-sec");
      thresholdPaceSec = pace.total;
      if (thresholdPaceSec <= 0) return showError("pano-error-box", "pano-error-text", { message: "Укажите средний темп", fields: ["test-pace-min", "test-pace-sec"] });
    }
    if (thresholdPaceSec < PANO_MIN_PACE || thresholdPaceSec > PANO_MAX_PACE) return showError("pano-error-box", "pano-error-text", { message: "Рассчитанный темп вне диапазона (1:30 – 15:00)", fields: [] });
    lthr = parsePositiveNumber(document.getElementById("test-hr").value);
    if (!lthr || lthr < PANO_MIN_HR || lthr > PANO_MAX_HR) return showError("pano-error-box", "pano-error-text", { message: "Пульс: 100–220 уд/мин", fields: ["test-hr"] });
  }
  renderPanoResults(thresholdPaceSec, Math.round(lthr));
}

function renderPanoResults(paceSec, lthr) {
  document.getElementById("pano-res-pace").textContent = formatPace(paceSec);
  document.getElementById("pano-res-speed").textContent = (3600 / paceSec).toFixed(2);
  document.getElementById("pano-res-hr").textContent = String(lthr);
  renderHRZones(lthr);
  renderPaceZones(paceSec);
  document.getElementById("pano-result").classList.remove("hidden");
  document.getElementById("pano-hr-zones").classList.remove("hidden");
  document.getElementById("pano-pace-zones").classList.remove("hidden");
  document.getElementById("pano-copy-btn").classList.remove("hidden");
  triggerUpdateAnimation("#pano-result .m-value");
  scrollToElement("pano-result");
}

function renderHRZones(lthr) {
  const zones = [
    { name: "Z1",  pctLo: null, pctHi: 0.85, color: "#D0ECFF", tc: "#1a3a5c", label: "Восстановление" },
    { name: "Z2",  pctLo: 0.85, pctHi: 0.89, color: "#A0D4F5", tc: "#12425e", label: "Аэробная" },
    { name: "Z3",  pctLo: 0.90, pctHi: 0.94, color: "#B5E6A3", tc: "#2d5a1e", label: "Темповая" },
    { name: "Z4",  pctLo: 0.95, pctHi: 0.99, color: "#FFE08A", tc: "#6b5900", label: "Подпороговая" },
    { name: "Z5a", pctLo: 1.00, pctHi: 1.02, color: "#FFB89A", tc: "#7a2e0e", label: "Пороговая" },
    { name: "Z5b", pctLo: 1.03, pctHi: 1.06, color: "#F5937A", tc: "#5c1a0a", label: "Анаэробная" },
    { name: "Z5c", pctLo: 1.06, pctHi: null, color: "#E06060", tc: "#fff",     label: "Нейромышечная" },
  ];
  document.getElementById("pano-hr-zones-table").innerHTML = zones.map(z => {
    let range = z.pctLo === null ? `< ${Math.round(lthr * z.pctHi)}` : z.pctHi === null ? `> ${Math.round(lthr * z.pctLo)}` : `${Math.round(lthr * z.pctLo)}–${Math.round(lthr * z.pctHi)}`;
    return `<div class="zone-row"><span class="zone-badge" style="background:${z.color};color:${z.tc}">${z.name}</span><span class="zone-label">${z.label}</span><span class="zone-range">${range}</span></div>`;
  }).join("");
}

function renderPaceZones(paceSec) {
  const zones = [
    { name: "Восстановление",       addLo: 90,  addHi: 150, color: "#D0ECFF", desc: "Восстановительные пробежки" },
    { name: "Легкий аэробный",       addLo: 45,  addHi: 90,  color: "#A0D4F5", desc: "Основной беговой объем" },
    { name: "Умеренный / steady",    addLo: 20,  addHi: 45,  color: "#B5E6A3", desc: "Длительные, темповая выносливость" },
    { name: "Пороговый",             addLo: -5,  addHi: 15,  color: "#FFE08A", desc: "Темповые отрезки, крейсерские интервалы" },
    { name: "Интервальный / VO₂max", addLo: -40, addHi: -15, color: "#FFB89A", desc: "Короткие интервалы высокой интенсивности" },
  ];
  document.getElementById("pano-pace-zones-table").innerHTML = zones.map(z => {
    const fast = Math.max(PANO_MIN_PACE, paceSec + z.addLo);
    const slow = Math.min(PANO_MAX_PACE, paceSec + z.addHi);
    return `<div class="pace-zone-row"><div class="pace-zone-header"><div class="pace-zone-name"><span class="pace-zone-dot" style="background:${z.color}"></span><span class="pace-zone-title">${z.name}</span></div><span class="pace-zone-range">${formatPace(fast)} – ${formatPace(slow)}</span></div><div class="pace-zone-desc">${z.desc}</div></div>`;
  }).join("");
}

function buildPanoResultText() {
  const pace = document.getElementById("pano-res-pace").textContent;
  const speed = document.getElementById("pano-res-speed").textContent;
  const hr = document.getElementById("pano-res-hr").textContent;
  let t = `🏃 ПАНО\n\nТемп: ${pace} мин/км\nСкорость: ${speed} км/ч\nПульс: ${hr} уд/мин\n\n❤️ Пульсовые зоны\n`;
  document.querySelectorAll("#pano-hr-zones-table .zone-row").forEach(r => {
    t += `${r.querySelector(".zone-badge").textContent}: ${r.querySelector(".zone-range").textContent} — ${r.querySelector(".zone-label").textContent}\n`;
  });
  t += `\n👟 Темповые зоны\n`;
  document.querySelectorAll("#pano-pace-zones-table .pace-zone-row").forEach(r => {
    t += `${r.querySelector(".pace-zone-title").textContent}: ${r.querySelector(".pace-zone-range").textContent} — ${r.querySelector(".pace-zone-desc").textContent}\n`;
  });
  return t;
}

// ============ FUELING MODULE ============

function bindFuelChips() {
  const bind = (groupId, stateKey) => {
    document.querySelectorAll(`#${groupId} .chip`).forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(`#${groupId} .chip`).forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        if (stateKey === "activity") activeFuelActivity = chip.dataset.val;
        else if (stateKey === "condition") activeFuelCondition = chip.dataset.val;
        else if (stateKey === "intensity") activeFuelIntensity = chip.dataset.val;
      });
    });
  };
  bind("fuel-activity-chips", "activity");
  bind("fuel-conditions-chips", "condition");
  bind("fuel-intensity-chips", "intensity");

  document.getElementById("fuel-copy-btn")?.addEventListener("click", () => {
    copyToClipboard(buildFuelResultText(), document.getElementById("fuel-copy-btn"), "Скопировать план");
  });
}

function fuelCarbRange(durationMin, intensity) {
  let lo, hi;
  if (durationMin <= 60)       { lo = 0;  hi = 30; }
  else if (durationMin <= 120) { lo = 30; hi = 60; }
  else if (durationMin <= 180) { lo = 60; hi = 75; }
  else                         { lo = 75; hi = 90; }

  if (intensity === "high")      return { lo: Math.round(lo + (hi - lo) * 0.5), hi };
  else if (intensity === "low")  return { lo, hi: Math.round(lo + (hi - lo) * 0.6) };
  return { lo, hi };
}

function fuelFluidRange(condition, weightKg, intensity, sweatRate) {
  if (sweatRate && sweatRate > 0) {
    return { lo: Math.round(sweatRate * 0.6), hi: Math.round(sweatRate * 0.8), fromSweat: true, sweatRate };
  }
  const base = { cool: [400, 600], moderate: [500, 800], hot: [700, 1000] }[condition] || [500, 800];
  let lo = base[0], hi = base[1];

  const wFactor = weightKg > 80 ? 1.1 : weightKg < 60 ? 0.9 : 1.0;
  const iFactor = intensity === "high" ? 1.1 : intensity === "low" ? 0.9 : 1.0;
  lo = Math.round(lo * wFactor * iFactor);
  hi = Math.round(hi * wFactor * iFactor);
  return { lo, hi, fromSweat: false };
}

function fuelSodiumRange(condition) {
  return { cool: { lo: 300, hi: 500 }, moderate: { lo: 500, hi: 700 }, hot: { lo: 700, hi: 1000 } }[condition] || { lo: 500, hi: 700 };
}

function calculateFuel() {
  clearErrors();

  if (!activeFuelActivity) return showError("fuel-error-box", "fuel-error-text", { message: "Выберите вид активности", fields: [] });

  const h = parsePositiveNumber(document.getElementById("fuel-hours").value);
  const m = parsePositiveNumber(document.getElementById("fuel-minutes").value);
  const durationMin = h * 60 + m;
  if (durationMin <= 0) return showError("fuel-error-box", "fuel-error-text", { message: "Укажите длительность", fields: ["fuel-hours", "fuel-minutes"] });
  if (durationMin > 1440) return showError("fuel-error-box", "fuel-error-text", { message: "Длительность не более 24 ч", fields: ["fuel-hours"] });

  const weightKg = parsePositiveNumber(document.getElementById("fuel-weight").value);
  if (!weightKg || weightKg < 30 || weightKg > 200) return showError("fuel-error-box", "fuel-error-text", { message: "Масса тела: 30–200 кг", fields: ["fuel-weight"] });

  let sweatRate = 0;
  const sweatVal = document.getElementById("fuel-sweat").value.trim();
  if (sweatVal !== "" && sweatVal !== "0") {
    sweatRate = parsePositiveNumber(sweatVal);
    if (sweatRate && (sweatRate < 200 || sweatRate > 3000)) {
      return showError("fuel-error-box", "fuel-error-text", { message: "Потоотделение: 200–3000 мл/час", fields: ["fuel-sweat"] });
    }
  }

  const durationHrs = durationMin / 60;
  const carbs = fuelCarbRange(durationMin, activeFuelIntensity);
  const fluid = fuelFluidRange(activeFuelCondition, weightKg, activeFuelIntensity, sweatRate);
  const sodium = fuelSodiumRange(activeFuelCondition);

  const carbsMid = Math.round((carbs.lo + carbs.hi) / 2);
  const fluidMid = Math.round((fluid.lo + fluid.hi) / 2);
  const sodiumMid = Math.round((sodium.lo + sodium.hi) / 2);

  const totalCarbs = Math.round(carbsMid * durationHrs);
  const totalFluid = Math.round(fluidMid * durationHrs);
  const totalSodium = Math.round(sodiumMid * durationHrs);

  const gels = Math.ceil(totalCarbs / FUEL_GEL_CARBS);
  const bottles = Math.ceil(totalFluid / FUEL_BOTTLE_ML);

  const plan = {
    durationMin, durationHrs, carbs, fluid, sodium,
    carbsMid, fluidMid, sodiumMid,
    totalCarbs, totalFluid, totalSodium,
    gels, bottles, weightKg, sweatRate, intensity: activeFuelIntensity, condition: activeFuelCondition
  };

  renderFuelResults(plan);
}

function renderFuelResults(p) {
  // Summary card
  let summaryNotes = "";
  if (p.durationMin <= 60 && p.intensity === "high") {
    summaryNotes = `<div class="fuel-note">При нагрузке до 60 мин можно обойтись <strong>полосканием рта</strong> углеводным напитком (mouth rinse) или небольшим количеством геля.</div>`;
  }
  if (p.durationMin > 180) {
    summaryNotes += `<div class="fuel-note">Верхние значения (80–90 г/ч) актуальны для <strong>тренированного ЖКТ</strong>. Увеличивайте постепенно.</div>`;
  }
  if (p.fluid.fromSweat) {
    summaryNotes += `<div class="fuel-note">Потери: ~${p.fluid.sweatRate} мл/ч. Рекомендуется восполнять <strong>60–80%</strong> потерь. Не пейте больше, чем теряете.</div>`;
  }

  document.getElementById("fuel-summary").innerHTML = `
    <h2 class="banner-title">Питание и гидратация</h2>
    <div class="fuel-hero">
      <div class="fuel-hero-item">
        <div class="fuel-hero-val">${p.carbs.lo}–${p.carbs.hi}</div>
        <div class="fuel-hero-unit">г/час</div>
        <div class="fuel-hero-label">Углеводы</div>
      </div>
      <div class="fuel-hero-item">
        <div class="fuel-hero-val">${p.fluid.lo}–${p.fluid.hi}</div>
        <div class="fuel-hero-unit">мл/час</div>
        <div class="fuel-hero-label">Жидкость</div>
      </div>
      <div class="fuel-hero-item">
        <div class="fuel-hero-val">${p.sodium.lo}–${p.sodium.hi}</div>
        <div class="fuel-hero-unit">мг/час</div>
        <div class="fuel-hero-label">Натрий</div>
      </div>
    </div>
    ${summaryNotes}`;

  // Timeline
  const carbsEvery = Math.round(p.carbsMid / (60 / 25));  // ~every 25 min
  const fluidEvery = Math.round(p.fluidMid / (60 / 17));  // ~every 17 min
  document.getElementById("fuel-timeline").innerHTML = `
    <h3 class="fuel-section-title">План по ходу нагрузки</h3>
    <div class="fuel-plan-row">
      <div class="fuel-plan-icon" style="background:#FFF3E0">🍯</div>
      <div class="fuel-plan-body">
        <div class="fuel-plan-title">Углеводы: ~${carbsEvery} г каждые 20–30 мин</div>
        <div class="fuel-plan-detail">${p.carbs.lo}–${p.carbs.hi} г/час · всего ~${p.totalCarbs} г за ${fmtDur(p.durationMin)}</div>
      </div>
    </div>
    <div class="fuel-plan-row">
      <div class="fuel-plan-icon" style="background:#E3F2FD">💧</div>
      <div class="fuel-plan-body">
        <div class="fuel-plan-title">Жидкость: ~${fluidEvery} мл каждые 15–20 мин</div>
        <div class="fuel-plan-detail">${p.fluid.lo}–${p.fluid.hi} мл/час · всего ~${p.totalFluid} мл</div>
      </div>
    </div>
    <div class="fuel-plan-row">
      <div class="fuel-plan-icon" style="background:#FBE9E7">🧂</div>
      <div class="fuel-plan-body">
        <div class="fuel-plan-title">Натрий: ${p.sodium.lo}–${p.sodium.hi} мг/час</div>
        <div class="fuel-plan-detail">Всего ~${p.totalSodium} мг · через изотоник или солевые капсулы</div>
      </div>
    </div>`;

  // Gear
  document.getElementById("fuel-gear").innerHTML = `
    <h3 class="fuel-section-title">Что взять с собой</h3>
    <div class="fuel-gear-grid">
      <div class="fuel-gear-item"><div class="fuel-gear-val">${p.gels}</div><div class="fuel-gear-label">гелей (по ${FUEL_GEL_CARBS} г)</div></div>
      <div class="fuel-gear-item"><div class="fuel-gear-val">${p.bottles}</div><div class="fuel-gear-label">фляг по ${FUEL_BOTTLE_ML} мл</div></div>
      <div class="fuel-gear-item"><div class="fuel-gear-val">${p.totalCarbs} г</div><div class="fuel-gear-label">углеводов всего</div></div>
      <div class="fuel-gear-item"><div class="fuel-gear-val">${p.totalSodium} мг</div><div class="fuel-gear-label">натрия всего</div></div>
    </div>`;

  // Pre/Post
  const preCarbsLo = Math.round(weightToNum(p.weightKg) * 1);
  const preCarbsHi = Math.round(weightToNum(p.weightKg) * 4);
  const postCarbsLo = Math.round(weightToNum(p.weightKg) * 1.0);
  const postCarbsHi = Math.round(weightToNum(p.weightKg) * 1.2);
  document.getElementById("fuel-pre-post").innerHTML = `
    <div class="fuel-tip-block">
      <div class="fuel-tip-title">⏱ Перед стартом (1–4 ч)</div>
      <div class="fuel-tip-text">${preCarbsLo}–${preCarbsHi} г углеводов (1–4 г на кг массы тела). Привычная еда с низким содержанием клетчатки и жира. Запейте 400–600 мл воды.</div>
    </div>
    <div class="fuel-tip-block">
      <div class="fuel-tip-title">🏁 После финиша (первые 1–2 ч)</div>
      <div class="fuel-tip-text">${postCarbsLo}–${postCarbsHi} г углеводов + 20–40 г белка. Актуально, если предстоит ещё одна сессия в ближайшие 24 ч.</div>
    </div>`;

  document.getElementById("fuel-results-wrap").classList.remove("hidden");
  document.getElementById("fuel-copy-btn").classList.remove("hidden");
  triggerUpdateAnimation("#fuel-summary .fuel-hero-val");
  scrollToElement("fuel-summary");
}

function fmtDur(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function weightToNum(v) { return typeof v === "number" ? v : parseFloat(v) || 0; }

function buildFuelResultText() {
  const s = document.getElementById("fuel-summary");
  const t = document.getElementById("fuel-timeline");
  const g = document.getElementById("fuel-gear");

  let text = "🔋 Fueling & Hydration\n\n";

  // Hero values
  const heroItems = s.querySelectorAll(".fuel-hero-item");
  heroItems.forEach(item => {
    text += `${item.querySelector(".fuel-hero-label").textContent}: ${item.querySelector(".fuel-hero-val").textContent} ${item.querySelector(".fuel-hero-unit").textContent}\n`;
  });
  text += "\n";

  // Plan
  text += "📋 План\n";
  t.querySelectorAll(".fuel-plan-row").forEach(row => {
    text += `${row.querySelector(".fuel-plan-title").textContent}\n`;
    text += `  ${row.querySelector(".fuel-plan-detail").textContent}\n`;
  });
  text += "\n";

  // Gear
  text += "🎒 С собой\n";
  g.querySelectorAll(".fuel-gear-item").forEach(item => {
    text += `${item.querySelector(".fuel-gear-val").textContent} — ${item.querySelector(".fuel-gear-label").textContent}\n`;
  });

  // Pre/post
  const tips = document.querySelectorAll("#fuel-pre-post .fuel-tip-block");
  if (tips.length) {
    text += "\n";
    tips.forEach(tip => {
      text += `${tip.querySelector(".fuel-tip-title").textContent}\n`;
      text += `${tip.querySelector(".fuel-tip-text").textContent}\n\n`;
    });
  }

  return text.trim();
}

// ============ GLOBAL DISPATCH ============

function handleCalculateAction() {
  const activePanel = document.querySelector(".tab-panel.active")?.id;
  if (activePanel === "tab-calories") calculateCalories();
  else if (activePanel === "tab-running") calculateRunning();
  else if (activePanel === "tab-pano") calculatePano();
  else if (activePanel === "tab-fuel") calculateFuel();
}

function initTelegram() {
  if (!tg) return;
  tg.ready(); tg.expand();
  if (tg.MainButton) {
    tg.MainButton.setText("РАССЧИТАТЬ");
    tg.MainButton.show();
    tg.MainButton.onClick(handleCalculateAction);
  }
}

function initApp() {
  tabButtons.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  // Calorie macro slicers (exclude all other data-* slicers)
  document.querySelectorAll(".macro-slicer:not([data-run-mode]):not([data-pano-mode]):not([data-test-input])").forEach(btn => {
    if (!btn.dataset.macroTab) return;
    btn.addEventListener("click", () => {
      document.querySelectorAll(`.macro-slicer[data-macro-tab]`).forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".macro-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`macro-panel-${btn.dataset.macroTab}`).classList.add("active");
    });
  });

  bindRunningSlicers();
  bindPanoSlicers();
  bindFuelChips();

  document.querySelectorAll("form").forEach(f => {
    f.addEventListener("submit", e => { e.preventDefault(); handleCalculateAction(); });
  });

  initTelegram();
  syncMainButton();
}

window.addEventListener("load", initApp);