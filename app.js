const tg = window.Telegram?.WebApp;

/* -------------------- tabs -------------------- */
const tabCaloriesBtn = document.getElementById('tab-calories-btn');
const tabRunningBtn = document.getElementById('tab-running-btn');
const tabCalories = document.getElementById('tab-calories');
const tabRunning = document.getElementById('tab-running');

let activeTab = 'calories';

function updateMainButton() {
  if (!tg?.MainButton) return;

  if (activeTab === 'calories') {
    tg.MainButton.setText('Рассчитать калории');
  } else {
    tg.MainButton.setText('Рассчитать темп и скорость');
  }

  tg.MainButton.show();
  tg.MainButton.enable();
}

function switchTab(tabName) {
  activeTab = tabName;

  const isCalories = tabName === 'calories';

  tabCaloriesBtn.classList.toggle('active', isCalories);
  tabCaloriesBtn.setAttribute('aria-selected', String(isCalories));

  tabRunningBtn.classList.toggle('active', !isCalories);
  tabRunningBtn.setAttribute('aria-selected', String(!isCalories));

  tabCalories.classList.toggle('active', isCalories);
  tabRunning.classList.toggle('active', !isCalories);

  updateMainButton();
}

tabCaloriesBtn.addEventListener('click', () => switchTab('calories'));
tabRunningBtn.addEventListener('click', () => switchTab('running'));

/* -------------------- calories -------------------- */
const form = document.getElementById('calorie-form');
const resultBlock = document.getElementById('result');
const errorBox = document.getElementById('error-box');
const errorText = document.getElementById('error-text');

const bmrValue = document.getElementById('bmr-value');
const cutValue = document.getElementById('cut-value');
const maintainValue = document.getElementById('maintain-value');
const bulkValue = document.getElementById('bulk-value');

const macrosSection = document.getElementById('macros-section');

const cutProteinValue = document.getElementById('cut-protein');
const cutFatValue = document.getElementById('cut-fat');
const cutCarbsValue = document.getElementById('cut-carbs');

const maintainProteinValue = document.getElementById('maintain-protein');
const maintainFatValue = document.getElementById('maintain-fat');
const maintainCarbsValue = document.getElementById('maintain-carbs');

const bulkProteinValue = document.getElementById('bulk-protein');
const bulkFatValue = document.getElementById('bulk-fat');
const bulkCarbsValue = document.getElementById('bulk-carbs');

function round(value) {
  return Math.round(value);
}

function formatRange(min, max) {
  return `${round(min)}–${round(max)}`;
}

function calculateBmr({ sex, age, heightCm, weightKg }) {
  if (sex === 'male') {
    return 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
  }

  return 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age;
}

function calculateMacros(targetCalories, weightKg, proteinPerKg, fatPerKg) {
  const proteinGrams = weightKg * proteinPerKg;
  const fatGrams = weightKg * fatPerKg;

  const caloriesFromProtein = proteinGrams * 4;
  const caloriesFromFat = fatGrams * 9;
  const remainingCalories = targetCalories - caloriesFromProtein - caloriesFromFat;
  const carbsGrams = Math.max(0, remainingCalories / 4);

  return {
    protein: round(proteinGrams),
    fat: round(fatGrams),
    carbs: round(carbsGrams),
  };
}

function calculateCalories({ sex, age, heightCm, weightKg, activity }) {
  const bmr = calculateBmr({ sex, age, heightCm, weightKg });
  const maintain = bmr * activity;

  const cutMin = maintain * 0.80;
  const cutMax = maintain * 0.90;

  const bulkMin = maintain * 1.05;
  const bulkMax = maintain * 1.15;

  const cutTargetForMacros = maintain * 0.85;
  const maintainTargetForMacros = maintain;
  const bulkTargetForMacros = maintain * 1.10;

  const cutMacros = calculateMacros(cutTargetForMacros, weightKg, 2.2, 0.8);
  const maintainMacros = calculateMacros(maintainTargetForMacros, weightKg, 2.0, 0.9);
  const bulkMacros = calculateMacros(bulkTargetForMacros, weightKg, 1.8, 0.9);

  return {
    bmr: round(bmr),
    cutRange: formatRange(cutMin, cutMax),
    maintain: round(maintain),
    bulkRange: formatRange(bulkMin, bulkMax),
    macros: {
      cut: cutMacros,
      maintain: maintainMacros,
      bulk: bulkMacros,
    },
  };
}

function showError(message) {
  errorText.textContent = message;
  errorBox.classList.remove('hidden');
}

function hideError() {
  errorText.textContent = '';
  errorBox.classList.add('hidden');
}

function readFormData() {
  return {
    sex: document.getElementById('sex').value,
    age: Number(document.getElementById('age').value),
    heightCm: Number(document.getElementById('height').value),
    weightKg: Number(document.getElementById('weight').value),
    activity: Number(document.getElementById('activity').value),
  };
}

function validate(data) {
  if (!data.age || !data.heightCm || !data.weightKg || !data.activity) {
    return 'Все поля обязательны.';
  }

  if (data.age < 1 || data.age > 120) {
    return 'Возраст должен быть в диапазоне 1–120.';
  }

  if (data.heightCm < 50 || data.heightCm > 250) {
    return 'Рост должен быть в диапазоне 50–250 см.';
  }

  if (data.weightKg < 20 || data.weightKg > 400) {
    return 'Вес должен быть в диапазоне 20–400 кг.';
  }

  return null;
}

function renderMacros(macros) {
  cutProteinValue.textContent = macros.cut.protein;
  cutFatValue.textContent = macros.cut.fat;
  cutCarbsValue.textContent = macros.cut.carbs;

  maintainProteinValue.textContent = macros.maintain.protein;
  maintainFatValue.textContent = macros.maintain.fat;
  maintainCarbsValue.textContent = macros.maintain.carbs;

  bulkProteinValue.textContent = macros.bulk.protein;
  bulkFatValue.textContent = macros.bulk.fat;
  bulkCarbsValue.textContent = macros.bulk.carbs;

  macrosSection.classList.remove('hidden');
}

function renderResult(result) {
  bmrValue.textContent = result.bmr;
  cutValue.textContent = result.cutRange;
  maintainValue.textContent = result.maintain;
  bulkValue.textContent = result.bulkRange;

  resultBlock.classList.remove('hidden');
  renderMacros(result.macros);
}

function processCaloriesCalculation() {
  hideError();

  const data = readFormData();
  const validationError = validate(data);

  if (validationError) {
    resultBlock.classList.add('hidden');
    macrosSection.classList.add('hidden');
    showError(validationError);
    return;
  }

  const result = calculateCalories(data);
  renderResult(result);

  if (tg?.MainButton) {
    tg.MainButton.setText('Пересчитать калории');
    tg.MainButton.show();
    tg.MainButton.enable();
  }

  setTimeout(() => {
    resultBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  processCaloriesCalculation();
});

/* -------------------- running -------------------- */
const runningForm = document.getElementById('running-form');
const runningErrorBox = document.getElementById('running-error-box');
const runningErrorText = document.getElementById('running-error-text');

const paceValue = document.getElementById('pace-value');
const speedValue = document.getElementById('speed-value');

function showRunningError(message) {
  runningErrorText.textContent = message;
  runningErrorBox.classList.remove('hidden');
}

function hideRunningError() {
  runningErrorText.textContent = '';
  runningErrorBox.classList.add('hidden');
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

function readRunningData() {
  const hours = Number(document.getElementById('run-hours').value);
  const minutes = Number(document.getElementById('run-minutes').value);
  const seconds = Number(document.getElementById('run-seconds').value);
  const km = Number(document.getElementById('run-km').value);
  const meters = Number(document.getElementById('run-meters').value);

  return { hours, minutes, seconds, km, meters };
}

function validateRunningData(data) {
  const totalSeconds = data.hours * 3600 + data.minutes * 60 + data.seconds;
  const totalMeters = data.km * 1000 + data.meters;

  if (totalSeconds <= 0) {
    return 'Время бега должно быть больше нуля.';
  }

  if (totalMeters <= 0) {
    return 'Дистанция должна быть больше нуля.';
  }

  if (data.meters < 0 || data.meters > 999) {
    return 'Метров должно быть в диапазоне 0–999.';
  }

  return null;
}

function processRunningCalculation() {
  hideRunningError();

  const data = readRunningData();
  const validationError = validateRunningData(data);

  if (validationError) {
    paceValue.textContent = '-';
    speedValue.textContent = '-';
    showRunningError(validationError);
    return;
  }

  const totalSeconds = data.hours * 3600 + data.minutes * 60 + data.seconds;
  const totalKm = data.km + data.meters / 1000;

  const secondsPerKm = totalSeconds / totalKm;
  const paceMinutes = Math.floor(secondsPerKm / 60);
  const paceSeconds = Math.round(secondsPerKm % 60);

  let normalizedPaceMinutes = paceMinutes;
  let normalizedPaceSeconds = paceSeconds;

  if (normalizedPaceSeconds === 60) {
    normalizedPaceMinutes += 1;
    normalizedPaceSeconds = 0;
  }

  const speed = totalKm / (totalSeconds / 3600);

  paceValue.textContent = `${normalizedPaceMinutes}:${pad2(normalizedPaceSeconds)}`;
  speedValue.textContent = speed.toFixed(2);
}

runningForm.addEventListener('submit', (event) => {
  event.preventDefault();
  processRunningCalculation();
});

/* -------------------- telegram -------------------- */
function handleMainButtonClick() {
  if (activeTab === 'calories') {
    processCaloriesCalculation();
  } else {
    processRunningCalculation();
  }
}

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setBackgroundColor('#f7f7f7');
  } catch (e) {}

  try {
    tg.setHeaderColor('#f7f7f7');
  } catch (e) {}

  if (tg.MainButton) {
    updateMainButton();
    tg.MainButton.offClick(handleMainButtonClick);
    tg.MainButton.onClick(handleMainButtonClick);
  }
}

switchTab('calories');