function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function formatDate(value = '') {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? 'Not listed'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function calculateAge(dateOfBirth = '') {
  const match = String(dateOfBirth).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'Not listed';
  const [, year, month, day] = match.map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day ||
    birth > new Date()
  ) return 'Not listed';

  const now = new Date();
  return String(
    now.getUTCFullYear() - year -
    (now.getUTCMonth() < month - 1 || (now.getUTCMonth() === month - 1 && now.getUTCDate() < day) ? 1 : 0)
  );
}

function formatHeight(inches, units) {
  const value = Number(inches);
  if (!Number.isFinite(value) || value <= 0) return 'Not listed';
  const feet = Math.floor(value / 12);
  const remainingInches = Math.round(value % 12);
  return units === 'metric'
    ? `${Math.round(value * 2.54)} cm`
    : `${feet}' ${remainingInches}"`;
}

function formatWeight(pounds, units) {
  const value = Number(pounds);
  if (!Number.isFinite(value) || value <= 0) return 'Not listed';
  return units === 'metric' ? `${(value * 0.45359237).toFixed(1)} kg` : `${value} lb`;
}

function statCard(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<div class="fighter-profile-stat"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
}

function section(title, content, className = '') {
  if (!content) return '';
  return `<section class="fighter-profile-section ${className}"><h2>${escapeHTML(title)}</h2>${content}</section>`;
}

function renderBout(title, bout) {
  if (!bout) return '';
  const result = bout.result
    ? `${bout.result}${bout.method ? ` · ${bout.method}` : ''}${bout.round ? ` · Round ${bout.round}` : ''}`
    : 'Result pending';
  return `
    <article class="fighter-bout">
      <div><span class="fighter-profile-label">${escapeHTML(title)}</span><strong>${escapeHTML(bout.opponent_name || 'Opponent not listed')}</strong></div>
      <div><span class="fighter-profile-label">${escapeHTML(formatDate(bout.date))}</span><span>${escapeHTML(bout.event_title || '')}</span></div>
      <strong class="fighter-bout-result">${escapeHTML(result)}</strong>
    </article>`;
}

function renderProfile(fighter, images) {
  const units = localStorage.getItem('fight-cards-units') === 'metric' ? 'metric' : 'imperial';
  const proRecord = fighter.records?.pro_mma?.value || 'Not listed';
  const ufcRecord = fighter.records?.ufc?.value || 'Not listed';
  const records = [
    statCard('Pro MMA record', proRecord),
    statCard('UFC record', ufcRecord),
    statCard('Submission grappling', fighter.records?.pro_submission_grappling?.value)
  ].join('');
  const physicalStats = [
    statCard('Height', formatHeight(fighter.height_inches, units)),
    statCard('Weight', formatWeight(fighter.weight_lbs, units)),
    statCard('Reach', formatHeight(fighter.reach_inches, units)),
    statCard('Stance', fighter.stance),
    statCard('Age', calculateAge(fighter.dob)),
    statCard('Date of birth', formatDate(fighter.dob)),
    statCard('Nationality', fighter.nationality),
    statCard('Birthplace', fighter.birthplace),
    statCard('Team', fighter.team)
  ].join('');
  const stats = fighter.stats || {};
  const performanceStats = [
    statCard('Significant strikes landed / min', stats.slpm),
    statCard('Striking accuracy', stats.str_acc),
    statCard('Significant strikes absorbed / min', stats.sapm),
    statCard('Striking defense', stats.str_def),
    statCard('Takedowns / 15 min', stats.td_avg),
    statCard('Takedown accuracy', stats.td_acc),
    statCard('Takedown defense', stats.td_def),
    statCard('Submission average / 15 min', stats.sub_avg)
  ].join('');
  const basis = stats.basis?.bouts
    ? `<p class="fighter-profile-note">Statistics based on ${escapeHTML(stats.basis.bouts)} bouts.</p>`
    : '';
  const powerIndex = fighter.power_index?.rating
    ? statCard('Power index', fighter.power_index.rating)
    : '';
  const fullBody = images?.fullBody || images?.headshot;
  const initials = fighter.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  return `
    <section class="fighter-profile-hero">
      <div class="fighter-profile-copy">
        <p class="fighter-profile-eyebrow">Fighter profile</p>
        <h1>${escapeHTML(fighter.name)}</h1>
        ${fighter.nickname ? `<p class="fighter-profile-nickname">“${escapeHTML(fighter.nickname)}”</p>` : ''}
      </div>
      <div class="fighter-profile-image">
        ${fullBody
          ? `<img src="${escapeHTML(fullBody)}" alt="Full-body image of ${escapeHTML(fighter.name)}" fetchpriority="high" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`
          : ''}
        <span class="fighter-profile-image-fallback"${fullBody ? ' hidden' : ''}>${escapeHTML(initials)}</span>
      </div>
    </section>
    ${section('Fighter details', `<div class="fighter-profile-stats">${physicalStats}</div>`)}
    ${section('Career records', `<div class="fighter-profile-stats">${records}</div>`)}
    ${section('Performance statistics', `<div class="fighter-profile-stats">${performanceStats}${powerIndex}</div>${basis}`)}
    ${section('Fight activity', `<div class="fighter-bout-list">${renderBout('Last fight', fighter.last_fight)}${renderBout('Next fight', fighter.next_fight)}</div>`)}
    <p class="fighter-profile-footnote">Measurements use your saved ${units === 'metric' ? 'metric' : 'imperial'} preference.</p>`;
}

async function initFighterProfile() {
  const root = document.documentElement;
  root.dataset.theme = localStorage.getItem('fight-cards-theme') === 'dark' ? 'dark' : 'light';
  const content = document.getElementById('fighterProfile');
  const slug = new URLSearchParams(location.search).get('fighter');

  try {
    if (!slug) throw new Error('No fighter was specified.');

    const [fightersResponse, imagesResponse] = await Promise.all([
      fetch('./data/fighters-cache.json'),
      fetch('./data/fighter-images.json')
    ]);
    if (!fightersResponse.ok) throw new Error(`Could not load fighter data (${fightersResponse.status}).`);
    if (!imagesResponse.ok) throw new Error(`Could not load fighter images (${imagesResponse.status}).`);

    const [fighters, imagesBySlug] = await Promise.all([
      fightersResponse.json(),
      imagesResponse.json()
    ]);
    const fighter = fighters[slug];
    if (!fighter) throw new Error('Fighter profile not found.');

    const imageEntry = imagesBySlug[slug] ||
      Object.values(imagesBySlug).find(entry => entry.slug === slug);
    content.innerHTML = renderProfile(fighter, imageEntry);
    document.title = `${fighter.name} | MMA Fight Cards`;
  } catch (error) {
    console.error(error);
    content.innerHTML = `<section class="fighter-profile-error"><h1>Could not load fighter profile</h1><p>${escapeHTML(error.message)}</p><a class="profile-back-link" href="./">Back to fight cards</a></section>`;
  }
}

initFighterProfile();
