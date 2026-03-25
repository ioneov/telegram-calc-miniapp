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
  const normalized = String(value ?? "").trim().replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : 0;
}


function getFieldValue(id) {
  return document.getElementById(id)?.value?.trim() ?? "";
}

function hasFieldValue(id) {
  return getFieldValue(id) !== "";
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function parseStrictNumber(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function readNumberField(id, {
  required = false,
  integer = false,
  min = null,
  max = null,
  allowZero = false,
  label = "Поле",
  requiredMessage = null,
  invalidMessage = null,
  integerMessage = null,
  rangeMessage = null
} = {}) {
  const raw = getFieldValue(id);

  if (raw === "") {
    if (!required) return { value: null, raw };
    return { error: { message: requiredMessage || `Заполните поле «${label}»`, fields: [id] } };
  }

  const value = parseStrictNumber(raw);
  if (value === null) {
    return { error: { message: invalidMessage || `Поле «${label}» должно быть числом`, fields: [id] } };
  }

  if (integer && !Number.isInteger(value)) {
    return { error: { message: integerMessage || `Поле «${label}» должно быть целым числом`, fields: [id] } };
  }

  if (allowZero ? value < 0 : value <= 0) {
    return { error: { message: rangeMessage || `Поле «${label}» имеет недопустимое значение`, fields: [id] } };
  }

  if ((min !== null && value < min) || (max !== null && value > max)) {
    return { error: { message: rangeMessage || `Поле «${label}» имеет недопустимое значение`, fields: [id] } };
  }

  return { value, raw };
}

function readTimeFields({ hoursId = null, minutesId = null, secondsId = null, maxHours = null } = {}) {
  const hoursRes = hoursId ? readNumberField(hoursId, {
    integer: true,
    min: 0,
    allowZero: true,
    label: "Часы",
    rangeMessage: maxHours !== null ? `Часы: 0–${maxHours}` : "Часы не могут быть отрицательными"
  }) : { value: 0 };
  if (hoursRes.error) return hoursRes;

  const minutesRes = minutesId ? readNumberField(minutesId, {
    integer: true,
    min: 0,
    allowZero: true,
    label: "Минуты",
    rangeMessage: "Минуты не могут быть отрицательными"
  }) : { value: 0 };
  if (minutesRes.error) return minutesRes;

  const secondsRes = secondsId ? readNumberField(secondsId, {
    integer: true,
    min: 0,
    allowZero: true,
    label: "Секунды",
    rangeMessage: "Секунды не могут быть отрицательными"
  }) : { value: 0 };
  if (secondsRes.error) return secondsRes;

  let h = hoursRes.value ?? 0;
  let m = minutesRes.value ?? 0;
  let s = secondsRes.value ?? 0;

  if (maxHours !== null && h > maxHours) {
    return { error: { message: `Часы: 0–${maxHours}`, fields: [hoursId] } };
  }

  const normalized = normalizeTime(h, m, s);
  if (hoursId) setFieldValue(hoursId, normalized.h || "");
  if (minutesId) setFieldValue(minutesId, normalized.m || "");
  if (secondsId) setFieldValue(secondsId, normalized.s || "");

  return {
    h: normalized.h,
    m: normalized.m,
    s: normalized.s,
    totalSeconds: normalized.h * 3600 + normalized.m * 60 + normalized.s
  };
}

function readCustomDistance(kmId, metersId) {
  const kmRes = readNumberField(kmId, {
    min: 0,
    allowZero: true,
    label: "Километры",
    rangeMessage: "Километры не могут быть отрицательными"
  });
  if (kmRes.error) return kmRes;

  const metersRes = readNumberField(metersId, {
    integer: true,
    min: 0,
    allowZero: true,
    label: "Метры",
    rangeMessage: "Метры не могут быть отрицательными"
  });
  if (metersRes.error) return metersRes;

  let km = kmRes.value ?? 0;
  let mt = metersRes.value ?? 0;
  if (mt >= 1000) {
    km += Math.floor(mt / 1000);
    mt = mt % 1000;
  }

  setFieldValue(kmId, km || "");
  setFieldValue(metersId, mt || "");

  return { km, meters: mt, totalKm: km + mt / 1000 };
}

function validateSelectValue(id, allowedValues, message) {
  const value = document.getElementById(id)?.value;
  if (!allowedValues.includes(value)) {
    return { error: { message, fields: [id] } };
  }
  return { value };
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
  const minRes = readNumberField(minId, {
    integer: true,
    min: 0,
    allowZero: true,
    label: "Минуты",
    rangeMessage: "Минуты не могут быть отрицательными"
  });
  if (minRes.error) return minRes;

  const secRes = readNumberField(secId, {
    integer: true,
    min: 0,
    allowZero: true,
    label: "Секунды",
    rangeMessage: "Секунды не могут быть отрицательными"
  });
  if (secRes.error) return secRes;

  let m = minRes.value ?? 0;
  let s = secRes.value ?? 0;

  if (!hasFieldValue(minId) && !hasFieldValue(secId)) {
    return { min: 0, sec: 0, total: 0, empty: true };
  }

  if (s >= 60) {
    m += Math.floor(s / 60);
    s = s % 60;
  }

  setFieldValue(minId, m || "");
  setFieldValue(secId, s || "");

  return { min: m, sec: s, total: m * 60 + s, empty: false };
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
  const sexRes = validateSelectValue("sex", ["male", "female"], "Недопустимое значение поля «Пол»");
  if (sexRes.error) return sexRes.error;

  const activityRes = validateSelectValue("activity", ["1.2", "1.375", "1.55", "1.725", "1.9"], "Недопустимое значение поля «Активность»");
  if (activityRes.error) return activityRes.error;

  const ageRes = readNumberField("age", {
    required: true,
    integer: true,
    min: 18,
    max: 100,
    label: "Возраст",
    requiredMessage: "Заполните поле «Возраст»",
    integerMessage: "Возраст должен быть целым числом",
    rangeMessage: "Возраст: 18–100 лет"
  });
  if (ageRes.error) return ageRes.error;

  const heightRes = readNumberField("height", {
    required: true,
    integer: true,
    min: 100,
    max: 250,
    label: "Рост",
    requiredMessage: "Заполните поле «Рост»",
    integerMessage: "Рост должен быть целым числом",
    rangeMessage: "Рост: 100–250 см"
  });
  if (heightRes.error) return heightRes.error;

  const weightRes = readNumberField("weight", {
    required: true,
    min: 30,
    max: 300,
    label: "Вес",
    requiredMessage: "Заполните поле «Вес»",
    rangeMessage: "Вес: 30–300 кг"
  });
  if (weightRes.error) return weightRes.error;

  const heightM = heightRes.value / 100;
  const bmi = weightRes.value / (heightM * heightM);
  if (bmi < 10 || bmi > 80) {
    return { message: `Нереалистичное соотношение роста и веса (ИМТ ${bmi.toFixed(1)})`, fields: ["height", "weight"] };
  }
  return null;
}

function calculateCalories() {
  clearErrors();
  const errorObj = validateCaloriesForm();
  if (errorObj) return showError("error-box", "error-text", errorObj);

  const sex = document.getElementById("sex").value;
  const age = readNumberField("age", { required: true, integer: true, min: 18, max: 100 }).value;
  const height = readNumberField("height", { required: true, integer: true, min: 100, max: 250 }).value;
  const weight = readNumberField("weight", { required: true, min: 30, max: 300 }).value;
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
  if (!activeFactDist) {
    return showError("running-error-box", "running-error-text", { message: "Выберите дистанцию", fields: [] });
  }

  const timeRes = readTimeFields({ hoursId: "fact-hours", minutesId: "fact-minutes", secondsId: "fact-seconds" });
  if (timeRes.error) return showError("running-error-box", "running-error-text", timeRes.error);
  if (timeRes.totalSeconds <= 0) {
    return showError("running-error-box", "running-error-text", { message: "Укажите время бега", fields: ["fact-hours", "fact-minutes", "fact-seconds"] });
  }

  let totalKm = 0;
  if (activeFactDist === "custom") {
    const distRes = readCustomDistance("fact-km", "fact-meters");
    if (distRes.error) return showError("running-error-box", "running-error-text", distRes.error);
    totalKm = distRes.totalKm;
  } else {
    totalKm = parseFloat(activeFactDist);
  }

  if (totalKm <= 0) {
    return showError("running-error-box", "running-error-text", { message: "Укажите дистанцию", fields: ["fact-km", "fact-meters"] });
  }

  let weight = null;
  if (hasFieldValue("fact-weight")) {
    const weightRes = readNumberField("fact-weight", { min: 30, max: 300, label: "Вес", rangeMessage: "Вес: 30–300 кг" });
    if (weightRes.error) return showError("running-error-box", "running-error-text", weightRes.error);
    weight = weightRes.value;
  }

  const paceSec = timeRes.totalSeconds / totalKm;
  if (paceSec < 30 || paceSec > 3600) {
    return showError("running-error-box", "running-error-text", { message: "Темп должен быть в диапазоне 0:30 – 60:00 мин/км", fields: ["fact-hours", "fact-minutes", "fact-seconds", "fact-km", "fact-meters"] });
  }

  const speed = totalKm / (timeRes.totalSeconds / 3600);
  document.getElementById("res-pace-value").textContent = formatPace(paceSec);
  document.getElementById("res-speed-value").textContent = speed.toFixed(2);

  const vdot = calcVDOT(totalKm * 1000, timeRes.totalSeconds / 60);
  const predDistances = [
    { id: "pred-1k", lossId: "wloss-1k", gainId: "wgain-1k", km: 1 },
    { id: "pred-3k", lossId: "wloss-3k", gainId: "wgain-3k", km: 3 },
    { id: "pred-5k", lossId: "wloss-5k", gainId: "wgain-5k", km: 5 },
    { id: "pred-10k", lossId: "wloss-10k", gainId: "wgain-10k", km: 10 },
    { id: "pred-21k", lossId: "wloss-21k", gainId: "wgain-21k", km: 21.0975 }
  ];
  predDistances.forEach(d => {
    document.getElementById(d.id).textContent = formatTime(predictTime(vdot, d.km * 1000) * 60);
  });

  const hasWeight = typeof weight === "number" && weight >= 30 && weight <= 300 && weight > 5;
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
  if (!activeTargetDist) {
    return showError("running-error-box", "running-error-text", { message: "Выберите дистанцию", fields: [] });
  }

  let totalKm = 0;
  if (activeTargetDist === "custom") {
    const distRes = readCustomDistance("target-km", "target-meters");
    if (distRes.error) return showError("running-error-box", "running-error-text", distRes.error);
    totalKm = distRes.totalKm;
  } else {
    totalKm = parseFloat(activeTargetDist);
  }

  const timeRes = readTimeFields({ hoursId: "target-hours", minutesId: "target-minutes", secondsId: "target-seconds" });
  if (timeRes.error) return showError("running-error-box", "running-error-text", timeRes.error);

  if (totalKm <= 0) {
    return showError("running-error-box", "running-error-text", { message: "Укажите дистанцию", fields: ["target-km", "target-meters"] });
  }
  if (timeRes.totalSeconds <= 0) {
    return showError("running-error-box", "running-error-text", { message: "Укажите желаемое время", fields: ["target-hours", "target-minutes", "target-seconds"] });
  }

  const paceSec = timeRes.totalSeconds / totalKm;
  if (paceSec < 30 || paceSec > 3600) {
    return showError("running-error-box", "running-error-text", { message: "Целевой темп должен быть в диапазоне 0:30 – 60:00 мин/км", fields: ["target-hours", "target-minutes", "target-seconds", "target-km", "target-meters"] });
  }

  const speed = totalKm / (timeRes.totalSeconds / 3600);
  document.getElementById("res-pace-value").textContent = formatPace(paceSec);
  document.getElementById("res-speed-value").textContent = speed.toFixed(2);
  document.getElementById("run-metrics-standard").classList.remove("hidden");
  document.getElementById("run-metrics-conv").classList.add("hidden");
  document.getElementById("predictions-block").classList.add("hidden");
  document.getElementById("weight-loss-block").classList.add("hidden");
  document.getElementById("weight-gain-block").classList.add("hidden");
}

let convTimeout;
function handleAutoCalcConv() {
  clearErrors();
  clearTimeout(convTimeout);
  convTimeout = setTimeout(() => calcConv(true), 300);
}

function calcConv(silent = false) {
  if (!silent) clearErrors();

  const vLabel = document.getElementById("conv-res-label");
  const vMain = document.getElementById("conv-res-value");
  const vUnit = document.getElementById("conv-res-unit");
  const vSub = document.getElementById("conv-res-sub");

  const fail = (errorObj) => {
    document.getElementById("run-metrics-standard").classList.add("hidden");
    document.getElementById("predictions-block").classList.add("hidden");
    document.getElementById("weight-loss-block").classList.add("hidden");
    document.getElementById("weight-gain-block").classList.add("hidden");
    document.getElementById("run-metrics-conv").classList.add("hidden");
    if (!silent && errorObj) showError("running-error-box", "running-error-text", errorObj);
    return null;
  };

  if (lastEditedConvSource === "pace") {
    const pace = parsePaceInput("conv-pace-min", "conv-pace-sec");
    if (pace.error) return fail(pace.error);
    if (pace.empty) return fail(null);

    const totalSecPerKm = pace.total;
    if (totalSecPerKm < 30 || totalSecPerKm > 3600) {
      return fail({ message: "Темп: 0:30 – 60:00 мин/км", fields: ["conv-pace-min", "conv-pace-sec"] });
    }

    const speed = 3600 / totalSecPerKm;
    vLabel.textContent = "Скорость";
    vMain.textContent = speed.toFixed(2);
    vUnit.textContent = "км/ч";
    vSub.textContent = `Округленно для дорожки: ${(Math.round(speed * 10) / 10).toFixed(1)}`;
  } else {
    const speedRes = readNumberField("conv-speed", {
      min: 1,
      max: 120,
      label: "Скорость",
      rangeMessage: "Скорость: 1–120 км/ч"
    });
    if (speedRes.error) return fail(speedRes.error);
    if (speedRes.value === null) return fail(null);

    const totalSecPerKm = 3600 / speedRes.value;
    vLabel.textContent = "Темп";
    vMain.textContent = formatPace(totalSecPerKm);
    vUnit.textContent = "мин/км";
    vSub.textContent = "";
  }

  document.getElementById("run-metrics-standard").classList.add("hidden");
  document.getElementById("predictions-block").classList.add("hidden");
  document.getElementById("weight-loss-block").classList.add("hidden");
  document.getElementById("weight-gain-block").classList.add("hidden");
  document.getElementById("run-metrics-conv").classList.remove("hidden");
  return true;
}

function calculateRunning() {
  clearErrors();
  if (activeRunMode === "fact") calcFact();
  else if (activeRunMode === "target") calcTarget();
  else if (activeRunMode === "conv") calcConv(false);

  if (document.getElementById("running-error-box").classList.contains("hidden")) {
    triggerUpdateAnimation(".running-res .m-value");
    scrollToElement("running-result");
  }
}


// ============ REALISM MODULE ============

function calculateRealism() {
  clearErrors();

  const curDistRes = validateSelectValue("realism-cur-dist", ["5", "10", "21.0975", "42.195"], "Ошибка выбора текущей дистанции");
  if (curDistRes.error) return showError("realism-error-box", "realism-error-text", curDistRes.error);
  const curDist = parseFloat(curDistRes.value);

  const curTime = readTimeFields({ hoursId: "realism-cur-h", minutesId: "realism-cur-m", secondsId: "realism-cur-s" });
  if (curTime.error) return showError("realism-error-box", "realism-error-text", curTime.error);
  if (curTime.totalSeconds <= 0) {
    return showError("realism-error-box", "realism-error-text", { message: "Укажите время текущего результата", fields: ["realism-cur-h", "realism-cur-m", "realism-cur-s"] });
  }

  const tgtDistRes = validateSelectValue("realism-tgt-dist", ["5", "10", "21.0975", "42.195"], "Ошибка выбора целевой дистанции");
  if (tgtDistRes.error) return showError("realism-error-box", "realism-error-text", tgtDistRes.error);
  const tgtDist = parseFloat(tgtDistRes.value);

  const tgtTime = readTimeFields({ hoursId: "realism-tgt-h", minutesId: "realism-tgt-m", secondsId: "realism-tgt-s" });
  if (tgtTime.error) return showError("realism-error-box", "realism-error-text", tgtTime.error);
  if (tgtTime.totalSeconds <= 0) {
    return showError("realism-error-box", "realism-error-text", { message: "Укажите целевое время", fields: ["realism-tgt-h", "realism-tgt-m", "realism-tgt-s"] });
  }

  const weeksRes = readNumberField("realism-weeks", {
    required: true,
    integer: true,
    min: 1,
    max: 104,
    label: "Недель до старта",
    requiredMessage: "Укажите сколько недель до старта",
    integerMessage: "Количество недель должно быть целым числом",
    rangeMessage: "Недель до старта: 1–104"
  });
  if (weeksRes.error) return showError("realism-error-box", "realism-error-text", weeksRes.error);
  const weeks = weeksRes.value;

  let vol = null;
  if (hasFieldValue("realism-vol")) {
    const volRes = readNumberField("realism-vol", {
      integer: true,
      min: 1,
      max: 300,
      label: "Объем (км/нед)",
      integerMessage: "Объем должен быть целым числом",
      rangeMessage: "Объем: 1–300 км/нед"
    });
    if (volRes.error) return showError("realism-error-box", "realism-error-text", volRes.error);
    vol = volRes.value;
  }

  const currentPaceSec = curTime.totalSeconds / curDist;
  const targetPaceSec = tgtTime.totalSeconds / tgtDist;
  if (currentPaceSec < 30 || currentPaceSec > 3600) {
    return showError("realism-error-box", "realism-error-text", { message: "Текущий результат дает нереалистичный темп", fields: ["realism-cur-h", "realism-cur-m", "realism-cur-s"] });
  }
  if (targetPaceSec < 30 || targetPaceSec > 3600) {
    return showError("realism-error-box", "realism-error-text", { message: "Цель дает нереалистичный темп", fields: ["realism-tgt-h", "realism-tgt-m", "realism-tgt-s"] });
  }

  const predSec = curTime.totalSeconds * Math.pow(tgtDist / curDist, 1.06);
  const gapSec = predSec - tgtTime.totalSeconds;
  const impPct = gapSec > 0 ? (gapSec / predSec) * 100 : 0;
  const paceGapSec = (predSec / tgtDist) - targetPaceSec;

  let level = 0;
  if (impPct <= 1.5) level = 0;
  else if (impPct <= 4.5) level = 1;
  else if (impPct <= 7.5) level = 2;
  else level = 3;

  if (weeks < 4 && level > 0 && level < 3) level++;
  if (weeks >= 12 && level === 3 && impPct <= 10) level--;

  const statuses = [
    { text: "Реалистично уже сейчас", bg: "#B5E6A3", color: "#2d5a1e" },
    { text: "Достижимо при хорошей подготовке", bg: "#A0D4F5", color: "#12425e" },
    { text: "Агрессивная цель", bg: "#FFE08A", color: "#6b5900" },
    { text: "Пока нереалистично", bg: "#FFB89A", color: "#7a2e0e" }
  ];
  const status = statuses[level];

  const badge = document.getElementById("realism-badge");
  badge.textContent = status.text;
  badge.style.background = status.bg;
  badge.style.color = status.color;

  document.getElementById("realism-pred-time").textContent = formatTime(predSec);
  document.getElementById("realism-tgt-pace").textContent = formatPace(targetPaceSec);

  const tgtDistText = tgtDist === 21.0975 ? "полумарафон" : tgtDist === 42.195 ? "марафон" : `${tgtDist} км`;
  const paceGapText = formatPace(Math.abs(paceGapSec));
  let interpretationHTML = `<p>Сейчас ваша форма на <strong>${tgtDistText}</strong> эквивалентна результату около <strong>${formatTime(predSec)}</strong>.</p>`;

  if (gapSec > 0) {
    if (level === 0) {
      interpretationHTML += `<p style="margin-top:8px;">Цель выглядит реалистичной уже сейчас. Нужно улучшить темп примерно на <strong>${paceGapText}/км</strong> или меньше. Главное — корректная подводка и раскладка по дистанции.</p>`;
    } else if (level === 1) {
      interpretationHTML += `<p style="margin-top:8px;">Цель достижима. Требуется улучшение порядка <strong>${impPct.toFixed(1)}%</strong> и ускорение примерно на <strong>${paceGapText}/км</strong>. Такой прогресс обычно возможен за ${weeks} нед. при системных тренировках${vol ? ` и объеме около ${vol} км/нед` : ""}.</p>`;
    } else if (level === 2) {
      interpretationHTML += `<p style="margin-top:8px;">Это амбициозный прыжок. За ${weeks} нед. нужно улучшить форму примерно на <strong>${impPct.toFixed(1)}%</strong>. Нужны стабильный план, контроль восстановления и реалистичная периодизация.</p>`;
    } else {
      interpretationHTML += `<p style="margin-top:8px;">Для срока в ${weeks} нед. такая цель пока малореалистична: требуется улучшение примерно на <strong>${impPct.toFixed(1)}%</strong>. Разумнее разбить путь на этапы и взять промежуточный ориентир.</p>`;
    }
  } else {
    interpretationHTML += `<p style="margin-top:8px;">Текущая форма <strong>уже позволяет</strong> рассчитывать на целевое время или даже лучше. Фокус — на подводке, тактике и отсутствии срывов в подготовке.</p>`;
  }

  document.getElementById("realism-interpretation").innerHTML = interpretationHTML;

  const distances = [
    { label: "5 км", val: 5 },
    { label: "10 км", val: 10 },
    { label: "Полумарафон", val: 21.0975 }
  ];
  const milestonesHTML = distances.map(d => {
    const msSec = tgtTime.totalSeconds * Math.pow(d.val / tgtDist, 1.06);
    return `
      <div class="zone-row">
        <span class="zone-label" style="padding-left: 8px;">${d.label}</span>
        <span class="zone-range">${formatTime(msSec)}</span>
      </div>
    `;
  }).join("");

  document.getElementById("realism-milestones-table").innerHTML = milestonesHTML;
  document.getElementById("realism-result").classList.remove("hidden");
  triggerUpdateAnimation("#realism-result .m-value, .realism-badge");
  scrollToElement("realism-result");
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
  let thresholdPaceSec;
  let lthr;

  if (activePanoMode === "direct") {
    const pace = parsePaceInput("pano-pace-min", "pano-pace-sec");
    if (pace.error) return showError("pano-error-box", "pano-error-text", pace.error);
    if (pace.empty) {
      return showError("pano-error-box", "pano-error-text", { message: "Укажите пороговый темп", fields: ["pano-pace-min", "pano-pace-sec"] });
    }
    thresholdPaceSec = pace.total;
    const hrRes = readNumberField("pano-hr", { required: true, integer: true, min: PANO_MIN_HR, max: PANO_MAX_HR, label: "Пороговый пульс", requiredMessage: "Укажите пороговый пульс", integerMessage: "Пороговый пульс должен быть целым числом", rangeMessage: "Пульс: 100–220 уд/мин" });
    if (hrRes.error) return showError("pano-error-box", "pano-error-text", hrRes.error);
    lthr = hrRes.value;
  } else {
    if (activeTestInput === "distance") {
      const distRes = readNumberField("test-dist", { required: true, min: 1, max: 15, label: "Дистанция", requiredMessage: "Укажите дистанцию", rangeMessage: "Дистанция: 1–15 км" });
      if (distRes.error) return showError("pano-error-box", "pano-error-text", distRes.error);
      thresholdPaceSec = 1800 / distRes.value;
    } else {
      const pace = parsePaceInput("test-pace-min", "test-pace-sec");
      if (pace.error) return showError("pano-error-box", "pano-error-text", pace.error);
      if (pace.empty) return showError("pano-error-box", "pano-error-text", { message: "Укажите средний темп", fields: ["test-pace-min", "test-pace-sec"] });
      thresholdPaceSec = pace.total;
    }

    if (thresholdPaceSec < PANO_MIN_PACE || thresholdPaceSec > PANO_MAX_PACE) {
      return showError("pano-error-box", "pano-error-text", { message: "Рассчитанный темп вне диапазона 1:30 – 15:00 мин/км", fields: [] });
    }

    const hrRes = readNumberField("test-hr", { required: true, integer: true, min: PANO_MIN_HR, max: PANO_MAX_HR, label: "Средний пульс", requiredMessage: "Укажите средний пульс", integerMessage: "Пульс должен быть целым числом", rangeMessage: "Пульс: 100–220 уд/мин" });
    if (hrRes.error) return showError("pano-error-box", "pano-error-text", hrRes.error);
    lthr = hrRes.value;
  }

  if (thresholdPaceSec < PANO_MIN_PACE || thresholdPaceSec > PANO_MAX_PACE) {
    return showError("pano-error-box", "pano-error-text", { message: "Темп: 1:30 – 15:00 мин/км", fields: [activePanoMode === "direct" ? "pano-pace-min" : "test-pace-min"] });
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

  if (!activeFuelActivity) {
    return showError("fuel-error-box", "fuel-error-text", { message: "Выберите вид активности", fields: [] });
  }

  const timeRes = readTimeFields({ hoursId: "fuel-hours", minutesId: "fuel-minutes", maxHours: 24 });
  if (timeRes.error) return showError("fuel-error-box", "fuel-error-text", timeRes.error);

  const durationMin = timeRes.h * 60 + timeRes.m;
  if (durationMin <= 0) {
    return showError("fuel-error-box", "fuel-error-text", { message: "Укажите длительность", fields: ["fuel-hours", "fuel-minutes"] });
  }
  if (durationMin > 1440) {
    return showError("fuel-error-box", "fuel-error-text", { message: "Длительность не более 24 ч", fields: ["fuel-hours"] });
  }

  const weightRes = readNumberField("fuel-weight", {
    required: true,
    min: 30,
    max: 200,
    label: "Масса тела",
    requiredMessage: "Укажите массу тела",
    rangeMessage: "Масса тела: 30–200 кг"
  });
  if (weightRes.error) return showError("fuel-error-box", "fuel-error-text", weightRes.error);
  const weightKg = weightRes.value;

  let sweatRate = 0;
  if (hasFieldValue("fuel-sweat")) {
    const sweatRes = readNumberField("fuel-sweat", {
      integer: true,
      min: 200,
      max: 3000,
      label: "Потоотделение",
      integerMessage: "Потоотделение должно быть целым числом",
      rangeMessage: "Потоотделение: 200–3000 мл/час"
    });
    if (sweatRes.error) return showError("fuel-error-box", "fuel-error-text", sweatRes.error);
    sweatRate = sweatRes.value;
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
  else if (activePanel === "tab-realism") calculateRealism();
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