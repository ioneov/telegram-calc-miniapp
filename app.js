const tg = window.Telegram?.WebApp;

const form = document.getElementById('calorie-form');
const resultBlock = document.getElementById('result');
const errorBox = document.getElementById('error-box');
const errorText = document.getElementById('error-text');
const webButton = document.getElementById('web-button');
const bannerCalcBtn = document.getElementById('banner-calc-btn');

const bmrValue = document.getElementById('bmr-value');
const cutValue = document.getElementById('cut-value');
const maintainValue = document.getElementById('maintain-value');
const bulkValue = document.getElementById('bulk-value');

function calculateCalories({ sex, age, heightCm, weightKg, activity }) {
  let bmr;

  // Revised Harris-Benedict
  if (sex === 'male') {
    bmr = 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
  } else {
    bmr = 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age;
  }

  const maintain = bmr * activity;
  const cut = maintain * 0.85;
  const bulk = maintain * 1.15;

  return {
    bmr: Math.round(bmr),
    cut: Math.round(cut),
    maintain: Math.round(maintain),
    bulk: Math.round(bulk),
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

function renderResult(result) {
  bmrValue.textContent = result.bmr;
  cutValue.textContent = result.cut;
  maintainValue.textContent = result.maintain;
  bulkValue.textContent = result.bulk;

  resultBlock.classList.remove('hidden');
}

function processCalculation() {
  hideError();

  const data = readFormData();
  const validationError = validate(data);

  if (validationError) {
    resultBlock.classList.add('hidden');
    showError(validationError);
    return;
  }

  const result = calculateCalories(data);
  renderResult(result);

  if (tg?.MainButton) {
    tg.MainButton.setText(`Поддержка: ${result.maintain} ккал`);
    tg.MainButton.show();
  }
}

if (tg) {
  tg.ready();
  tg.expand();

  if (tg.MainButton) {
    tg.MainButton.setText('Рассчитать');
    tg.MainButton.onClick(processCalculation);
    tg.MainButton.show();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  processCalculation();
});

if (bannerCalcBtn) {
  bannerCalcBtn.addEventListener('click', processCalculation);
}