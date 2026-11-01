function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function fighterPortraitMarkup(fighter = {}) {
  const initials = (fighter.name || 'Fighter')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  return `
    <div class="fighter-portrait">
      <img src="${escapeHTML(fighter.image || './images/fighter-placeholder.png')}" alt="" loading="lazy" onerror="if(this.dataset.fallback){this.hidden=true;this.nextElementSibling.hidden=false}else{this.dataset.fallback='true';this.src='./images/fighter-placeholder.png'}">
      <span class="fighter-portrait-fallback" hidden>${escapeHTML(initials)}</span>
    </div>`;
}

function fighterRanking(fighter = {}) {
  const rankings = Array.isArray(fighter.rankings) ? fighter.rankings : [];
  if (!rankings.length) return 'Unranked';

  return rankings.map(ranking => {
    const division = String(ranking.division || '')
      .replace(/^womens-/, "Women's ")
      .replace(/^mens-/, "Men's ")
      .replace(/-/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase())
      .replace(/'S\b/g, "'s");
    const rank = ranking.is_champion
      ? 'Champion'
      : Number.isInteger(Number(ranking.rank)) && Number(ranking.rank) > 0
        ? `#${ranking.rank}`
        : 'Unranked';
    return division ? `${rank} · ${division}` : rank;
  }).join(', ');
}

function fighterNationality(fighter = {}) {
  const nationality = fighter.nationality || fighter.country || '';
  return nationality === 'United States' ? 'USA' : nationality || 'Not listed';
}

function eventLocation(location = '') {
  return String(location).replace(/\bUnited States\b/g, 'USA');
}

function formatEventDate(date = '') {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;

  const [, year, month, day] = match;
  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsedDate.getUTCFullYear() !== Number(year) ||
    parsedDate.getUTCMonth() !== Number(month) - 1 ||
    parsedDate.getUTCDate() !== Number(day)
  ) {
    return date;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(parsedDate);
}

function formatLocalTime(dateTime = '') {
  const timestamp = Date.parse(dateTime);
  if (Number.isNaN(timestamp)) return 'TBA';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp);
}

export function renderFightCard(event) {
  if (!event) {
    return '<div class="empty-state">No event data available.</div>';
  }

  const fights = Array.isArray(event.fights) ? event.fights : [];
  const mainCardFights = fights.filter(fight => fight.card_position !== 'prelim');
  const prelimFights = fights.filter(fight => fight.card_position === 'prelim');
  const eventName = event.name || 'Fight card';

  function renderFightRows(cardFights) {
    return cardFights.length
      ? cardFights.map(fight => {
        const fighter1 = fight.fighter_1 || {};
        const fighter2 = fight.fighter_2 || {};
        const odds = fight.odds || {};
        const weightClass = String(fight.weight_class || 'Bout')
          .replace(/^women['’]s\s+/i, '');

        return `
        <details class="fight-row">
          <summary class="fight-summary">
            <div class="fight-weight">${escapeHTML(fight.card_position === 'main_event' ? 'Main Event · ' : '')}${escapeHTML(weightClass)}</div>
            <div class="fight-names">
              <span>${escapeHTML(fighter1.name || 'TBA')}</span>
              <b>VS</b>
              <span>${escapeHTML(fighter2.name || 'TBA')}</span>
            </div>
          </summary>
          <div class="fight-details">
            <div class="fight-details-inner">
              <div class="fighter-details">
                ${fighterPortraitMarkup(fighter1)}
                ${fighterPortraitMarkup(fighter2)}
                <div class="fighter-stat-row">
                  <span class="fighter-stat-value">${escapeHTML(fighter1.record || 'Not listed')}</span>
                  <span class="fighter-stat-label">Record</span>
                  <span class="fighter-stat-value">${escapeHTML(fighter2.record || 'Not listed')}</span>
                </div>
                <div class="fighter-stat-row">
                  <span class="fighter-stat-value">${escapeHTML(fighterNationality(fighter1))}</span>
                  <span class="fighter-stat-label">Nationality</span>
                  <span class="fighter-stat-value">${escapeHTML(fighterNationality(fighter2))}</span>
                </div>
                <div class="fighter-stat-row">
                  <span class="fighter-stat-value">${escapeHTML(fighterRanking(fighter1))}</span>
                  <span class="fighter-stat-label">Ranking</span>
                  <span class="fighter-stat-value">${escapeHTML(fighterRanking(fighter2))}</span>
                </div>
                <div class="fighter-stat-row">
                  <span class="fighter-stat-value fighter-measurement" data-kind="height" data-value="${escapeHTML(fighter1.height || '')}">${escapeHTML(fighter1.height || 'Not listed')}</span>
                  <span class="fighter-stat-label">Height</span>
                  <span class="fighter-stat-value fighter-measurement" data-kind="height" data-value="${escapeHTML(fighter2.height || '')}">${escapeHTML(fighter2.height || 'Not listed')}</span>
                </div>
                <div class="fighter-stat-row">
                  <span class="fighter-stat-value fighter-measurement" data-kind="weight" data-value="${escapeHTML(fighter1.weight || '')}">${escapeHTML(fighter1.weight || 'Not listed')}</span>
                  <span class="fighter-stat-label">Weight</span>
                  <span class="fighter-stat-value fighter-measurement" data-kind="weight" data-value="${escapeHTML(fighter2.weight || '')}">${escapeHTML(fighter2.weight || 'Not listed')}</span>
                </div>
                <div class="fighter-stat-row fighter-odds-row">
                  <strong class="fighter-stat-value fight-odds-value" data-american="${escapeHTML(odds.fighter_1 || '')}">${escapeHTML(odds.fighter_1 || 'Not listed')}</strong>
                  <span class="fighter-stat-label">Odds</span>
                  <strong class="fighter-stat-value fight-odds-value" data-american="${escapeHTML(odds.fighter_2 || '')}">${escapeHTML(odds.fighter_2 || 'Not listed')}</strong>
                </div>
              </div>
            </div>
          </div>
        </details>`;
      }).join('')
      : '<div class="fight-empty">Fights to be announced</div>';
  }

  const fightSectionsMarkup = `
    <div class="event-rule"></div>
    <div class="fight-sections">
      <section class="fight-group">
        <h2 class="section-label">Main Card</h2>
        <div class="undercard">${renderFightRows(mainCardFights)}</div>
      </section>
      <section class="fight-group">
        <h2 class="section-label">Prelims</h2>
        <div class="undercard">${renderFightRows(prelimFights)}</div>
      </section>
    </div>`;

  return `
    <article class="event-card">
      <h1 class="event-title">${escapeHTML(eventName)}</h1>
      <div class="event-subtitle">
        <span class="event-date-location">
          <span>${escapeHTML(formatEventDate(event.date || 'Date TBA'))}</span>
          <span>${escapeHTML(eventLocation(event.location || 'Location TBA'))}</span>
        </span>
        <div class="event-schedule" aria-label="Local fight card start times">
          <span>Main Card: ${escapeHTML(formatLocalTime(event.schedule?.main_card_start_time || ''))}</span>
          <span>Prelims: ${escapeHTML(formatLocalTime(event.schedule?.prelims_start_time || ''))}</span>
        </div>
        <span class="event-countdown" data-start="${escapeHTML(event.start_time || '')}" aria-live="off" hidden>Start time TBA</span>
      </div>
      ${fightSectionsMarkup}
    </article>`;
}
