// --- Elements ---
const hourlyRateInput = document.getElementById('hourlyRate');
const salaryInput = document.getElementById('salaryInput');
const hoursPerWeekInput = document.getElementById('hoursPerWeek');
const activeToggle = document.getElementById('activeToggle');
const calcRate = document.getElementById('calcRate');
const pricesFound = document.getElementById('pricesFound');
const maxPrice = document.getElementById('maxPrice');
const toast = document.getElementById('toast');
const modeBtns = document.querySelectorAll('.mode-btn');
const manualSection = document.getElementById('manualSection');
const salarySection = document.getElementById('salarySection');

let saveTimeout;

// --- Load saved settings ---
chrome.storage.sync.get(
  ['hourlyRate', 'isActive', 'mode', 'salary', 'hoursPerWeek', 'stats'],
  (data) => {
    if (data.hourlyRate) hourlyRateInput.value = data.hourlyRate;
    if (data.salary) salaryInput.value = data.salary;
    if (data.hoursPerWeek) hoursPerWeekInput.value = data.hoursPerWeek;
    activeToggle.checked = data.isActive !== false;

    const mode = data.mode || 'manual';
    setMode(mode);

    if (data.stats) {
      pricesFound.textContent = data.stats.count || '—';
      maxPrice.textContent = data.stats.max ? data.stats.max.toFixed(1) : '—';
    }

    updateCalcRate();
  }
);

// --- Mode switching ---
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    setMode(btn.dataset.mode);
    save();
  });
});

function setMode(mode) {
  modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  manualSection.style.display = mode === 'manual' ? 'block' : 'none';
  salarySection.style.display = mode === 'salary' ? 'block' : 'none';
}

// --- Salary calculator ---
function updateCalcRate() {
  const salary = parseFloat(salaryInput.value);
  const hpw = parseFloat(hoursPerWeekInput.value);
  if (salary > 0 && hpw > 0) {
    // Monthly salary → hourly: salary / (hours_per_week * 4.33)
    const rate = salary / (hpw * 4.33);
    calcRate.textContent = Math.round(rate) + ' ₽';
    return Math.round(rate);
  }
  calcRate.textContent = '— ₽';
  return null;
}

salaryInput.addEventListener('input', () => {
  updateCalcRate();
  save();
});

hoursPerWeekInput.addEventListener('input', () => {
  updateCalcRate();
  save();
});

// --- Save and notify content script ---
function getEffectiveRate() {
  const activeMode = document.querySelector('.mode-btn.active').dataset.mode;
  if (activeMode === 'salary') {
    return updateCalcRate();
  }
  return parseFloat(hourlyRateInput.value) || null;
}

function save() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const rate = getEffectiveRate();
    const activeMode = document.querySelector('.mode-btn.active').dataset.mode;

    chrome.storage.sync.set({
      hourlyRate: rate,
      isActive: activeToggle.checked,
      mode: activeMode,
      salary: parseFloat(salaryInput.value) || null,
      hoursPerWeek: parseFloat(hoursPerWeekInput.value) || 40,
    });

    // Notify active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          hourlyRate: rate,
          isActive: activeToggle.checked,
        }).catch(() => {});
      }
    });

    showToast();
  }, 300);
}

function showToast() {
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
}

hourlyRateInput.addEventListener('input', save);
activeToggle.addEventListener('change', save);

// --- Listen for stats from content script ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'stats') {
    pricesFound.textContent = msg.count || '—';
    maxPrice.textContent = msg.max ? msg.max.toFixed(1) : '—';
    chrome.storage.sync.set({
      stats: { count: msg.count, max: msg.max },
    });
  }
});
