const tg = window.Telegram?.WebApp;

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

  if (bmr <= 0) {
    return { error: 'Расчёт BMR дал некорректный результат. Проверьте данные.' };
  }

  const maintain = bmr * activity;

  const cutMin = maintain * 0.80;
  const cutMax = maintain * 0.90;

  const bulkMin = maintain * 1.05;
  const bulkMax = maintain * 1.15;

  // БЖУ: разные сценарии
  const cutTargetForMacros = maintain * 0.85;
  const maintainTargetForMacros = maintain;
  const bulkTargetForMacros = maintain * 1.10;

  const cutMacros = calculateMacros(cutTargetForMacros, weightKg, 2.2, 0.8);
  const maintainMacros = calculateMacros(maintainTargetForMacros, weightKg, 2.0, 0.9);
  const bulkMacros = calculateMacros(bulkTargetForMacros, weightKg, 1.8, 0.9);

  // Проверка: если углеводы = 0, белки+жиры превышают калораж
  const macrosWarning =
    cutMacros.carbs === 0 || maintainMacros.carbs === 0 || bulkMacros.carbs === 0;

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
    macrosWarning,
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

  if (!Number.isInteger(data.age)) {
    return 'Возраст должен быть целым числом.';
  }

  if (data.age < 18 || data.age > 100) {
    return 'Возраст должен быть в диапазоне 18–100. Формула не предназначена для детей.';
  }

  if (data.heightCm < 100 || data.heightCm > 250) {
    return 'Рост должен быть в диапазоне 100–250 см.';
  }

  if (data.weightKg < 30 || data.weightKg > 300) {
    return 'Вес должен быть в диапазоне 30–300 кг.';
  }

  // Кросс-валидация: BMI в пределах 10–80
  const heightM = data.heightCm / 100;
  const bmi = data.weightKg / (heightM * heightM);
  if (bmi < 10 || bmi > 80) {
    return `Соотношение роста и веса нереалистично (ИМТ = ${bmi.toFixed(1)}). Проверьте введённые данные.`;
  }

  return null;
}

function renderMacros(macros, macrosWarning) {
  cutProteinValue.textContent = macros.cut.protein;
  cutFatValue.textContent = macros.cut.fat;
  cutCarbsValue.textContent = macros.cut.carbs;

  maintainProteinValue.textContent = macros.maintain.protein;
  maintainFatValue.textContent = macros.maintain.fat;
  maintainCarbsValue.textContent = macros.maintain.carbs;

  bulkProteinValue.textContent = macros.bulk.protein;
  bulkFatValue.textContent = macros.bulk.fat;
  bulkCarbsValue.textContent = macros.bulk.carbs;

  const warningEl = document.getElementById('macros-warning');
  if (macrosWarning) {
    warningEl.classList.remove('hidden');
  } else {
    warningEl.classList.add('hidden');
  }

  macrosSection.classList.remove('hidden');
}

function renderResult(result) {
  bmrValue.textContent = result.bmr;
  cutValue.textContent = result.cutRange;
  maintainValue.textContent = result.maintain;
  bulkValue.textContent = result.bulkRange;

  resultBlock.classList.remove('hidden');
  renderMacros(result.macros, result.macrosWarning);
}

function processCalculation() {
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

  if (result.error) {
    resultBlock.classList.add('hidden');
    macrosSection.classList.add('hidden');
    showError(result.error);
    return;
  }

  renderResult(result);

  if (tg?.MainButton) {
    tg.MainButton.setText('Пересчитать');
    tg.MainButton.show();
    tg.MainButton.enable();
  }

  setTimeout(() => {
    resultBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

if (tg) {
  tg.ready();
  tg.expand();

  if (tg.MainButton) {
    tg.MainButton.setText('Рассчитать');
    tg.MainButton.show();
    tg.MainButton.enable();
    tg.MainButton.offClick(processCalculation);
    tg.MainButton.onClick(processCalculation);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  processCalculation();
});