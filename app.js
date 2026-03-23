const tg = window.Telegram?.WebApp;

/* Логика переключения разделов (Калории / Бег) */
const tabButtons = document.querySelectorAll('.tab-item');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchTab(tabName) {
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
  
  if (tg?.MainButton) {
    tg.MainButton.setText('РАССЧИТАТЬ');
    tg.MainButton.show();
  }
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

/* Логика переключения БЖУ (Сброс / Норма / Набор) */
const macroButtons = document.querySelectorAll('.macro-slicer');
const macroPanels = document.querySelectorAll('.macro-panel');

macroButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    macroButtons.forEach(b => b.classList.remove('active'));
    macroPanels.forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(`macro-panel-${btn.dataset.macroTab}`).classList.add('active');
  });
});

/* Расчет калорий */
function calculateCalories() {
  const sex = document.getElementById('sex').value;
  const age = Number(document.getElementById('age').value);
  const height = Number(document.getElementById('height').value);
  const weight = Number(document.getElementById('weight').value);
  const activity = Number(document.getElementById('activity').value);

  const errBox = document.getElementById('error-box');
  if (!age || !height || !weight) {
    errBox.classList.remove('hidden');
    document.getElementById('error-text').textContent = "Заполните все поля";
    return;
  }
  errBox.classList.add('hidden');

  // Формула Миффлина-Сан Жеора
  let bmr = (10 * weight) + (6.25 * height) - (5 * age);
  bmr = sex === 'male' ? bmr + 5 : bmr - 161;

  const maintain = Math.round(bmr * activity);
  
  document.getElementById('bmr-value').textContent = Math.round(bmr);
  document.getElementById('maintain-value').textContent = maintain;
  document.getElementById('cut-value').textContent = Math.round(maintain * 0.85);
  document.getElementById('bulk-value').textContent = Math.round(maintain * 1.15);

  updateMacros(maintain, weight);
}

/* Расчет БЖУ для всех трех вкладок */
function updateMacros(maintainKcal, weight) {
  const goals = {
    cut: { kcal: Math.round(maintainKcal * 0.85), p: 2.2, f: 0.8 },
    maintain: { kcal: maintainKcal, p: 2.0, f: 0.9 },
    bulk: { kcal: Math.round(maintainKcal * 1.15), p: 1.8, f: 1.0 }
  };

  Object.keys(goals).forEach(key => {
    const config = goals[key];
    const protein = Math.round(weight * config.p);
    const fat = Math.round(weight * config.f);
    const carbs = Math.max(0, Math.round((config.kcal - (protein * 4 + fat * 9)) / 4));

    document.getElementById(`${key}-protein`).textContent = protein + 'г';
    document.getElementById(`${key}-fat`).textContent = fat + 'г';
    document.getElementById(`${key}-carbs`).textContent = carbs + 'г';
  });
}

/* Расчет бега */
function calculateRunning() {
  const h = Number(document.getElementById('run-hours').value);
  const m = Number(document.getElementById('run-minutes').value);
  const s = Number(document.getElementById('run-seconds').value);
  const km = Number(document.getElementById('run-km').value);
  const mt = Number(document.getElementById('run-meters').value);

  const totalSeconds = (h * 3600) + (m * 60) + s;
  const totalKm = km + (mt / 1000);

  if (totalSeconds > 0 && totalKm > 0) {
    const paceTotalSeconds = totalSeconds / totalKm;
    const paceMinutes = Math.floor(paceTotalSeconds / 60);
    const paceSeconds = Math.round(paceTotalSeconds % 60);
    const speed = totalKm / (totalSeconds / 3600);

    document.getElementById('pace-value').textContent = `${paceMinutes}:${paceSeconds.toString().padStart(2, '0')}`;
    document.getElementById('speed-value').textContent = speed.toFixed(2);
  }
}

/* Инициализация Telegram Mini App */
if (tg) {
  tg.ready();
  tg.expand();
  tg.MainButton.setText('РАССЧИТАТЬ');
  tg.MainButton.show();
  
  tg.MainButton.onClick(() => {
    const activePanel = document.querySelector('.tab-panel.active').id;
    if (activePanel === 'tab-calories') calculateCalories();
    else calculateRunning();
  });
}