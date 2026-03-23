const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const form = document.getElementById('calorie-form');
const resultBlock = document.getElementById('result');
const bmrValue = document.getElementById('bmr-value');
const caloriesValue = document.getElementById('calories-value');

function calculateCalories({ sex, age, heightCm, weightKg, activity }) {
  let bmr;

  // Revised Harris-Benedict
  if (sex === 'male') {
    bmr = 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
  } else {
    bmr = 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.330 * age;
  }

  const calories = bmr * activity;

  return {
    bmr: Math.round(bmr),
    calories: Math.round(calories),
  };
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const sex = document.getElementById('sex').value;
  const age = Number(document.getElementById('age').value);
  const heightCm = Number(document.getElementById('height').value);
  const weightKg = Number(document.getElementById('weight').value);
  const activity = Number(document.getElementById('activity').value);

  if (!age || !heightCm || !weightKg || !activity) {
    alert('Заполните все поля корректно');
    return;
  }

  const result = calculateCalories({
    sex,
    age,
    heightCm,
    weightKg,
    activity,
  });

  bmrValue.textContent = result.bmr;
  caloriesValue.textContent = result.calories;
  resultBlock.classList.remove('hidden');
});