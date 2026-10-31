import { renderFightCard } from './fight-cards.js';
import { createCube } from './cube.js';

if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
}

function initTheme() {
  const root = document.documentElement;
  const toggle = document.getElementById('themeToggle');
  const toggleText = document.getElementById('themeToggleText');
  const toggleIcon = document.getElementById('themeToggleIcon');
  const themeColorMeta = document.getElementById('themeColorMeta');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPage = document.getElementById('settingsPage');
  const cubeStage = document.getElementById('cubeStage');
  const cardProgress = document.getElementById('cardProgress');
  const settingsIcon = document.getElementById('settingsIcon');
  const backIcon = document.getElementById('backIcon');

  const savedTheme = localStorage.getItem('fight-cards-theme');
  const initialTheme = savedTheme === 'light' ? 'light' : 'dark';

  function applyTheme(theme) {
    root.dataset.theme = theme;
    const isDark = theme === 'dark';
    toggleText.textContent = isDark ? 'DARK' : 'LIGHT';
    toggleIcon.textContent = isDark ? '☾' : '☼';
    toggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    themeColorMeta.setAttribute('content', isDark ? '#101116' : '#f4f4f5');
    localStorage.setItem('fight-cards-theme', theme);
  }

  applyTheme(initialTheme);
  toggle.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  settingsToggle.addEventListener('click', () => {
    const showSettings = settingsPage.hidden;
    settingsPage.hidden = !showSettings;
    cubeStage.hidden = showSettings;
    cardProgress.hidden = showSettings;
    settingsToggle.setAttribute('aria-expanded', String(showSettings));
    settingsToggle.setAttribute('aria-label', showSettings ? 'Back to fight cards' : 'Open settings');
    settingsIcon.hidden = showSettings;
    backIcon.hidden = !showSettings;
    document.title = showSettings ? 'Settings | Fight Cards' : 'Fight Cards';
  });

  document.addEventListener('keydown', event => {
    if (settingsPage.hidden) return;
    if (event.key === 'Escape') settingsToggle.click();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopImmediatePropagation();
  });
}

function initSharing() {
  const instagramButton = document.getElementById('shareInstagram');
  const shareStatus = document.getElementById('shareStatus');
  const siteUrl = 'https://mmafightcards.org/';

  instagramButton.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'MMA Fight Cards',
          text: 'Check out MMA Fight Cards.',
          url: siteUrl
        });
        shareStatus.textContent = 'Choose Instagram in your share options.';
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(siteUrl);
      shareStatus.textContent = 'Link copied. Paste it into Instagram to share.';
    } catch {
      shareStatus.textContent = 'Could not copy the link. Visit https://mmafightcards.org/ to share it.';
    }
  });
}

function initPreferences() {
  const unitsControl = document.getElementById('unitsPreference');
  const oddsControl = document.getElementById('oddsPreference');
  const units = localStorage.getItem('fight-cards-units');
  const odds = localStorage.getItem('fight-cards-odds');

  unitsControl.value = units === 'imperial' ? 'imperial' : 'metric';
  oddsControl.value = ['fractional', 'decimal'].includes(odds) ? odds : 'american';

  function applyPreferences() {
    document.querySelectorAll('.fighter-measurement').forEach(element => {
      const source = element.dataset.value || '';
      const heightMatch = source.match(/^\s*(?:(\d+)\s*(?:ft|')\s*)?(?:(\d+)\s*(?:in|")?)?\s*$/i);
      if (element.dataset.kind === 'height' && heightMatch && (heightMatch[1] || heightMatch[2])) {
        const inches = (Number(heightMatch[1] || 0) * 12) + Number(heightMatch[2] || 0);
        element.textContent = unitsControl.value === 'metric'
          ? `${Math.round(inches * 2.54)} cm`
          : `${Math.floor(inches / 12)}' ${inches % 12}"`;
        return;
      }

      const weightMatch = source.match(/^\s*(\d+(?:\.\d+)?)\s*(lbs?|kg)\s*$/i);
      if (element.dataset.kind === 'weight' && weightMatch) {
        const amount = Number(weightMatch[1]);
        const isKg = weightMatch[2].toLowerCase().startsWith('kg');
        const pounds = isKg ? amount / 0.45359237 : amount;
        element.textContent = unitsControl.value === 'metric'
          ? `${(pounds * 0.45359237).toFixed(1)} kg`
          : `${(isKg ? pounds : amount).toFixed(isKg ? 1 : 0)} lb`;
        return;
      }

      element.textContent = source || 'Not listed';
    });

    document.querySelectorAll('.fight-odds-value').forEach(element => {
      const rawOdds = element.dataset.american || '';
      if (!/^[+-]?\d+$/.test(rawOdds.trim())) {
        element.textContent = rawOdds || 'Not listed';
        return;
      }
      const americanOdds = Number(rawOdds);
      if (americanOdds === 0) {
        element.textContent = rawOdds;
        return;
      }

      if (oddsControl.value === 'american') {
        element.textContent = americanOdds > 0 ? `+${americanOdds}` : String(americanOdds);
        return;
      }

      if (oddsControl.value === 'decimal') {
        const decimalOdds = americanOdds > 0
          ? 1 + (americanOdds / 100)
          : 1 + (100 / Math.abs(americanOdds));
        element.textContent = decimalOdds.toFixed(2);
        return;
      }

      let numerator = americanOdds > 0 ? americanOdds : 100;
      let denominator = americanOdds > 0 ? 100 : Math.abs(americanOdds);
      let a = numerator;
      let b = denominator;
      while (b) [a, b] = [b, a % b];
      numerator /= a;
      denominator /= a;
      element.textContent = `${numerator}/${denominator}`;
    });
  }

  unitsControl.addEventListener('change', () => {
    localStorage.setItem('fight-cards-units', unitsControl.value);
    applyPreferences();
  });
  oddsControl.addEventListener('change', () => {
    localStorage.setItem('fight-cards-odds', oddsControl.value);
    applyPreferences();
  });

  return applyPreferences;
}

function updateCountdowns() {
  document.querySelectorAll('.event-countdown').forEach(countdown => {
    const startTime = Date.parse(countdown.dataset.start || '');
    let display;

    if (Number.isNaN(startTime)) {
      display = 'Start time TBA';
    } else {
      const remainingSeconds = Math.floor((startTime - Date.now()) / 1000);
      if (remainingSeconds <= 0) {
        display = 'Event started';
      } else {
        const totalMinutes = Math.floor(remainingSeconds / 60);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        display = remainingSeconds > 7 * 86400
          ? `${days} ${days === 1 ? 'day' : 'days'}`
          : remainingSeconds >= 86400
            ? `${days}d ${hours}h`
            : remainingSeconds < 3600
              ? `${Math.floor(remainingSeconds / 60)}m ${remainingSeconds % 60}s`
              : `${Math.floor(totalMinutes / 60)}h ${minutes}m`;
      }
    }

    if (countdown.dataset.display === display) return;
    countdown.dataset.display = display;
    if (display === 'Start time TBA' || display === 'Event started') {
      countdown.textContent = display;
      return;
    }
    countdown.innerHTML = display.replace(/\d/g, digit => `<span class="countdown-digit">${digit}</span>`);
  });
}

async function initApp() {
  initTheme();
  initSharing();
  const applyPreferences = initPreferences();
  const app = document.getElementById('app');
  const cube = document.getElementById('cube');
  const cardProgress = document.getElementById('cardProgress');

  function updateCardProgress(index, total) {
    if (cardProgress.childElementCount !== total) {
      cardProgress.replaceChildren(...Array.from({ length: total }, () => {
        const segment = document.createElement('span');
        segment.className = 'card-progress-segment';
        return segment;
      }));
      cardProgress.setAttribute('aria-valuemax', String(total));
    }

    cardProgress.setAttribute('aria-valuenow', String(index + 1));
    cardProgress.setAttribute('aria-valuetext', `Event card ${index + 1} of ${total}`);
    Array.from(cardProgress.children).forEach((segment, segmentIndex) => {
      const active = segmentIndex === index;
      segment.classList.toggle('is-active', active);
      if (active) segment.setAttribute('aria-current', 'step');
      else segment.removeAttribute('aria-current');
    });
  }

  function toggleFight(summary) {
    const selectedFight = summary.closest('.fight-row');
    const shouldOpen = !selectedFight.open;
    app.querySelectorAll('.fight-row[open]').forEach(fight => {
      if (fight !== selectedFight) fight.open = false;
    });
    selectedFight.open = shouldOpen;
  }

  function getFightSummaryAtPoint(event) {
    const frontFace = app.querySelector('.cube-face[data-front]');
    if (!frontFace) return null;

    return Array.from(frontFace.querySelectorAll('.fight-summary')).find(summary => {
      const bounds = summary.getBoundingClientRect();
      return event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    }) || null;
  }

  let fightTapCandidate = null;
  app.addEventListener('pointerdown', event => {
    const summary = getFightSummaryAtPoint(event);
    fightTapCandidate = summary
      ? { pointerId: event.pointerId, summary, x: event.clientX, y: event.clientY }
      : null;
  });
  app.addEventListener('pointerup', event => {
    const candidate = fightTapCandidate;
    fightTapCandidate = null;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    const releasedOnSummary = getFightSummaryAtPoint(event);
    if (releasedOnSummary !== candidate.summary) return;
    if (Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 24) return;
    toggleFight(candidate.summary);
  });
  app.addEventListener('pointercancel', () => {
    fightTapCandidate = null;
  });

  app.addEventListener('click', event => {
    const summary = event.target.closest('.fight-summary');
    if (!summary) return;
    if (event.detail !== 0) {
      event.preventDefault();
      return;
    }

    toggleFight(summary);
    event.preventDefault();
  });

  const faces = [
    document.getElementById('face0'),
    document.getElementById('face1'),
    document.getElementById('face2'),
    document.getElementById('face3')
  ];
  try {
    const response = await fetch('./data/events.json');
    if (!response.ok) throw new Error(`Could not load events.json (${response.status})`);

    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];

    if (!events.length) throw new Error('No events found in events.json');

    // Render each event once. The cube reuses these pre-rendered cards.
    const preparedEvents = events.map(event => ({
      ...event,
      __html: renderFightCard(event)
    }));

    createCube({
      app,
      cube,
      faces,
      events: preparedEvents,
      onIndexChange(index, total) {
        updateCardProgress(index, total);
        applyPreferences();
        updateCountdowns();
      }
    });
    applyPreferences();
    window.setInterval(updateCountdowns, 1000);

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./service-worker.js').catch(error => {
        console.warn('Service worker registration failed:', error);
      });
    }
  } catch (error) {
    console.error(error);
    faces[0].innerHTML = `<div class="empty-state"><div><strong>Could not load fight cards</strong><br><br>${error.message}<br><br>Run this project through a local web server, not by opening index.html directly.</div></div>`;
  }
}

initApp();
