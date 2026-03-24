const tg = window.Telegram?.WebApp || null;
const WORKER_BASE_URL = "https://frosty-hall-66b2.7570745.workers.dev";

const tabButtons = document.querySelectorAll(".tab-item");
const tabPanels = document.querySelectorAll(".tab-panel");
const macroButtons = document.querySelectorAll(".macro-slicer");
const macroPanels = document.querySelectorAll(".macro-panel");

const calorieInlineBtn = document.getElementById("calculate-inline-btn");
const runningInlineBtn = document.getElementById("running-inline-btn");

function showError(boxId, textId, message) {
  const box = document.getElementById(boxId);
  const text = document.getElementById(textId);
  text.textContent = message;
  box.classList.remove("hidden");
}

function hideError(boxId) {
  const box = document.getElementById(boxId);
  box.classList.add("hidden");
}

function switchTab(tabName) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });

  syncMainButton();
}

function syncMainButton() {
  if (!tg?.MainButton) return;

  const activePanel = document.querySelector(".tab-panel.active")?.id;
  tg.MainButton.setText("РАССЧИТАТЬ");
  tg.MainButton.show();

  if (activePanel === "tab-calories") {
    tg.MainButton.enable();
  } else if (activePanel === "tab-running") {
    tg.MainButton.enable();
  }
}

function bindTabs() {
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function bindMacroSlicers() {
  macroButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      macroButtons.forEach((b) => b.classList.remove("active"));
      macroPanels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      document
        .getElementById(`macro-panel-${btn.dataset.macroTab}`)
        .classList.add("active");
    });
  });
}

function parsePositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function validateCaloriesForm() {
  const age = parsePositiveNumber(document.getElementById("age").value);
  const height = parsePositiveNumber(document.getElementById("height").value);
  const weight = parsePositiveNumber(document.getElementById("weight").value);

  if (!age || !height || !weight) {
    return "Заполните возраст, рост и вес";
  }

  if (age < 1 || age > 120) {
    return "Возраст должен быть в диапазоне 1–120";
  }

  if (height < 50 || height > 300) {
    return "Рост должен быть в диапазоне 50–300 см";
  }

  if (weight < 20 || weight > 500) {
    return "Вес должен быть в диапазоне 20–500 кг";
  }

  return null;
}

function calculateCalories() {
  const validationError = validateCaloriesForm();
  if (validationError) {
    showError("error-box", "error-text", validationError);
    return;
  }

  hideError("error-box");

  const sex = document.getElementById("sex").value;
  const age = parsePositiveNumber(document.getElementById("age").value);
  const height = parsePositiveNumber(document.getElementById("height").value);
  const weight = parsePositiveNumber(document.getElementById("weight").value);
  const activity = parsePositiveNumber(document.getElementById("activity").value);

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
}

function updateMacros(maintainKcal, weight) {
  const goals = {
    cut: { kcal: Math.round(maintainKcal * 0.85), p: 2.2, f: 0.8 },
    maintain: { kcal: maintainKcal, p: 2.0, f: 0.9 },
    bulk: { kcal: Math.round(maintainKcal * 1.15), p: 1.8, f: 1.0 }
  };

  let hasLowCarbScenario = false;

  Object.keys(goals).forEach((key) => {
    const config = goals[key];
    const protein = Math.round(weight * config.p);
    const fat = Math.round(weight * config.f);
    const carbs = Math.max(
      0,
      Math.round((config.kcal - (protein * 4 + fat * 9)) / 4)
    );

    if (carbs < 50) {
      hasLowCarbScenario = true;
    }

    document.getElementById(`${key}-protein`).textContent = `${protein} г`;
    document.getElementById(`${key}-fat`).textContent = `${fat} г`;
    document.getElementById(`${key}-carbs`).textContent = `${carbs} г`;
  });

  const warning = document.getElementById("macros-warning");
  warning.classList.toggle("hidden", !hasLowCarbScenario);
}

function validateRunningForm() {
  const h = parsePositiveNumber(document.getElementById("run-hours").value);
  const m = parsePositiveNumber(document.getElementById("run-minutes").value);
  const s = parsePositiveNumber(document.getElementById("run-seconds").value);
  const km = parsePositiveNumber(document.getElementById("run-km").value);
  const mt = parsePositiveNumber(document.getElementById("run-meters").value);

  if (m > 59 || s > 59) {
    return "Минуты и секунды должны быть в диапазоне 0–59";
  }

  if (mt > 999) {
    return "Метры должны быть в диапазоне 0–999";
  }

  const totalSeconds = h * 3600 + m * 60 + s;
  const totalKm = km + mt / 1000;

  if (totalSeconds <= 0) {
    return "Укажите время бега больше 0";
  }

  if (totalKm <= 0) {
    return "Укажите дистанцию больше 0";
  }

  return null;
}

function calculateRunning() {
  const validationError = validateRunningForm();
  if (validationError) {
    showError("running-error-box", "running-error-text", validationError);
    return;
  }

  hideError("running-error-box");

  const h = parsePositiveNumber(document.getElementById("run-hours").value);
  const m = parsePositiveNumber(document.getElementById("run-minutes").value);
  const s = parsePositiveNumber(document.getElementById("run-seconds").value);
  const km = parsePositiveNumber(document.getElementById("run-km").value);
  const mt = parsePositiveNumber(document.getElementById("run-meters").value);

  const totalSeconds = h * 3600 + m * 60 + s;
  const totalKm = km + mt / 1000;

  const paceTotalSeconds = totalSeconds / totalKm;
  let paceMinutes = Math.floor(paceTotalSeconds / 60);
  let paceSeconds = Math.round(paceTotalSeconds % 60);

  if (paceSeconds === 60) {
    paceMinutes += 1;
    paceSeconds = 0;
  }

  const speed = totalKm / (totalSeconds / 3600);

  document.getElementById("pace-value").textContent =
    `${paceMinutes}:${String(paceSeconds).padStart(2, "0")}`;
  document.getElementById("speed-value").textContent = speed.toFixed(2);
}

function handleCalculateAction() {
  const activePanel = document.querySelector(".tab-panel.active")?.id;

  if (activePanel === "tab-calories") {
    calculateCalories();
    return;
  }

  if (activePanel === "tab-running") {
    calculateRunning();
  }
}

function bindInlineButtons() {
  calorieInlineBtn.addEventListener("click", calculateCalories);
  runningInlineBtn.addEventListener("click", calculateRunning);
}

async function testBackendConnectionSilently() {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/ping`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log("Worker OK:", data);
  } catch (error) {
    console.error("Worker unavailable:", error);
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