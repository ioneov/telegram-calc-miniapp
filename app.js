const tg = window.Telegram?.WebApp || null;
const WORKER_BASE_URL = "https://frosty-hall-66b2.7570745.workers.dev";

const tabButtons = document.querySelectorAll(".tab-item");
const tabPanels = document.querySelectorAll(".tab-panel");
const macroButtons = document.querySelectorAll(".macro-slicer");
const macroPanels = document.querySelectorAll(".macro-panel");

const calorieInlineBtn = document.getElementById("calculate-inline-btn");
const runningInlineBtn = document.getElementById("running-inline-btn");

// UX Helpers
function showError(boxId, textId, errorObj) {
  const box = document.getElementById(boxId);
  const text = document.getElementById(textId);
  text.textContent = errorObj.message;
  box.classList.remove("hidden");
  
  errorObj.fields.forEach(id => {
    document.getElementById(id)?.classList.add("input-error");
  });
}

function clearErrors() {
  document.querySelectorAll(".error-box").forEach(box => box.classList.add("hidden"));
  document.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));
}

function triggerUpdateAnimation(selector) {
  const elements = document.querySelectorAll(selector);
  elements.forEach(el => {
    el.classList.remove("update-flash");
    void el.offsetWidth; // trigger reflow
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

// Tabs & UI bindings
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

function bindTabs() {
  tabButtons.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
}

function bindMacroSlicers() {
  macroButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      macroButtons.forEach(b => b.classList.remove("active"));
      macroPanels.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`macro-panel-${btn.dataset.macroTab}`).classList.add("active");
    });
  });
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
  if (errorObj) {
    showError("error-box", "error-text", errorObj);
    return;
  }

  const sex = document.getElementById("sex").value;
  const age = parsePositiveNumber(document.getElementById("age").value);
  const height = parsePositiveNumber(document.getElementById("height").value);
  const weight = parsePositiveNumber(document.getElementById("weight").value);
  const activity = Number(document.getElementById("activity").value);

  let bmr = 10 * weight + 6.25 * height - 5 * age;
  bmr = sex === "male" ? bmr + 5 : bmr - 161;

  const maintain = Math.round(bmr * activity);
  const cut = Math.round(maintain * 0.85);
  const bulk = Math.round(maintain * 1.15);

  document.getElementById("bmr-value").textContent = String(Math.round(bmr));
  document.getElementById("maintain-value").textContent = String(maintain);
  document.getElementById("cut-value").textContent = String(cut);
  document.getElementById("bulk-value").textContent = String(bulk);

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

  let hasLowCarbScenario = false;

  Object.keys(goals).forEach(key => {
    const config = goals[key];
    const pGrams = Math.round(weight * config.p);
    const fGrams = Math.round(weight * config.f);
    
    // Calculate exact calories based on rounded grams for consistent percentages
    const pKcal = pGrams * 4;
    const fKcal = fGrams * 9;
    
    const remainingKcal = Math.max(0, config.kcal - (pKcal + fKcal));
    const cGrams = Math.round(remainingKcal / 4);
    const cKcal = cGrams * 4;
    
    const totalActualKcal = pKcal + fKcal + cKcal;

    if (cGrams < 50) hasLowCarbScenario = true;

    document.getElementById(`${key}-protein`).textContent = `${pGrams} г`;
    document.getElementById(`${key}-fat`).textContent = `${fGrams} г`;
    document.getElementById(`${key}-carbs`).textContent = `${cGrams} г`;

    // Render detailed split
    const pPct = totalActualKcal > 0 ? Math.round((pKcal / totalActualKcal) * 100) : 0;
    const fPct = totalActualKcal > 0 ? Math.round((fKcal / totalActualKcal) * 100) : 0;
    const cPct = totalActualKcal > 0 ? 100 - pPct - fPct : 0;

    document.getElementById(`${key}-p-details`).innerHTML = `${pPct}% &bull; ${pKcal} ккал`;
    document.getElementById(`${key}-f-details`).innerHTML = `${fPct}% &bull; ${fKcal} ккал`;
    document.getElementById(`${key}-c-details`).innerHTML = `${cPct}% &bull; ${cKcal} ккал`;
  });

  document.getElementById("macros-warning").classList.toggle("hidden", !hasLowCarbScenario);
}

// Running Logic
function normalizeRunningInputs() {
  let s = parsePositiveNumber(document.getElementById("run-seconds").value);
  let m = parsePositiveNumber(document.getElementById("run-minutes").value);
  let h = parsePositiveNumber(document.getElementById("run-hours").value);
  let mt = parsePositiveNumber(document.getElementById("run-meters").value);
  let km = parsePositiveNumber(document.getElementById("run-km").value);

  if (s >= 60) { m += Math.floor(s / 60); s = s % 60; }
  if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
  if (mt >= 1000) { km += Math.floor(mt / 1000); mt = mt % 1000; }

  if (s || document.getElementById("run-seconds").value) document.getElementById("run-seconds").value = s || "";
  if (m || document.getElementById("run-minutes").value) document.getElementById("run-minutes").value = m || "";
  if (h || document.getElementById("run-hours").value) document.getElementById("run-hours").value = h || "";
  if (mt || document.getElementById("run-meters").value) document.getElementById("run-meters").value = mt || "";
  if (km || document.getElementById("run-km").value) document.getElementById("run-km").value = km || "";

  return { h, m, s, km, mt };
}

function validateRunningForm(vals) {
  const totalSeconds = vals.h * 3600 + vals.m * 60 + vals.s;
  const totalKm = vals.km + vals.mt / 1000;
  
  const timeFields = ["run-hours", "run-minutes", "run-seconds"];
  const distFields = ["run-km", "run-meters"];

  if (totalSeconds <= 0 && totalKm <= 0) return { message: "Укажите время и дистанцию", fields: [...timeFields, ...distFields] };
  if (totalSeconds <= 0) return { message: "Укажите время бега", fields: timeFields };
  if (totalKm <= 0) return { message: "Укажите дистанцию", fields: distFields };

  return null;
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function calculateRunning() {
  clearErrors();
  const vals = normalizeRunningInputs();
  const errorObj = validateRunningForm(vals);
  
  if (errorObj) {
    showError("running-error-box", "running-error-text", errorObj);
    return;
  }

  const totalSeconds = vals.h * 3600 + vals.m * 60 + vals.s;
  const totalKm = vals.km + vals.mt / 1000;

  // Pace
  const paceTotalSeconds = totalSeconds / totalKm;
  let paceMinutes = Math.floor(paceTotalSeconds / 60);
  let paceSeconds = Math.round(paceTotalSeconds % 60);
  if (paceSeconds === 60) { paceMinutes += 1; paceSeconds = 0; }
  
  // Speed
  const speed = totalKm / (totalSeconds / 3600);

  document.getElementById("pace-value").textContent = `${paceMinutes}:${String(paceSeconds).padStart(2, "0")}`;
  document.getElementById("speed-value").textContent = speed.toFixed(2);

  // Predictions
  const distances = [
    { id: "pred-1k", km: 1 },
    { id: "pred-3k", km: 3 },
    { id: "pred-5k", km: 5 },
    { id: "pred-10k", km: 10 },
    { id: "pred-21k", km: 21.0975 }
  ];

  distances.forEach(d => {
    document.getElementById(d.id).textContent = formatTime(paceTotalSeconds * d.km);
  });

  document.getElementById("predictions-block").classList.remove("hidden");
  
  triggerUpdateAnimation("#running-result .m-value, .predict-time");
  scrollToElement("running-result");
}

function handleCalculateAction() {
  const activePanel = document.querySelector(".tab-panel.active")?.id;
  if (activePanel === "tab-calories") calculateCalories();
  else if (activePanel === "tab-running") calculateRunning();
}

function bindInlineButtons() {
  calorieInlineBtn.addEventListener("click", calculateCalories);
  runningInlineBtn.addEventListener("click", calculateRunning);
}

async function testBackendConnectionSilently() {
  try {
    await fetch(`${WORKER_BASE_URL}/api/ping`, { method: "GET", headers: { Accept: "application/json" } });
  } catch (error) {
    // Silent fail
  }
}

function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (tg.MainButton) {
    tg.MainButton.setText("РАССЧИТАТЬ");
    tg.MainButton.show();
    tg.MainButton.onClick(handleCalculateAction);
  }
}

function initApp() {
  bindTabs();
  bindMacroSlicers();
  bindInlineButtons();
  initTelegram();
  syncMainButton();
  testBackendConnectionSilently();
}

window.addEventListener("load", initApp);