import { supabaseClient } from '../js/auth.js';

const signedOutState   = document.getElementById('signedOutState');
const noChallengeState = document.getElementById('noChallengeState');
const calendarState    = document.getElementById('calendarState');
const gateSignInBtn    = document.getElementById('gateSignInBtn');
const challengeSelect  = document.getElementById('challengeSelect');
const calendarChallengeName = document.getElementById('calendarChallengeName');

const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const monthLabel   = document.getElementById('monthLabel');
const calendarGrid = document.getElementById('calendarGrid');

const dayPopover = document.getElementById('dayPopover');
const popDate    = document.getElementById('popDate');
const popBody     = document.getElementById('popBody');

let currentUser = null;
let challenges = [];
let selectedChallenge = null;
let entries = [];
let entryByDate = new Map(); // date string -> { entry, target, plDollar, plPct, hit }
let viewYear, viewMonth; // 0-indexed month

gateSignInBtn.addEventListener('click', () => window.toggleAuth());

/* ── View switching ── */
function showState(name) {
    signedOutState.classList.toggle('hidden', name !== 'out');
    noChallengeState.classList.toggle('hidden', name !== 'no-challenge');
    calendarState.classList.toggle('hidden', name !== 'calendar');
}

/* ── Formatting ── */
const fmtMoney = (n) => '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct   = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const pad2 = (n) => String(n).padStart(2, '0');
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ── Load challenges, populate selector ── */
async function loadChallenges() {
    const { data, error } = await supabaseClient
        .from('challenges')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }
    challenges = data || [];

    if (!challenges.length) {
        showState('no-challenge');
        return;
    }

    challengeSelect.innerHTML = challenges.map(c =>
        `<option value="${c.id}">${escapeHtml(c.name)} (${c.status})</option>`
    ).join('');

    const preferred = challenges.find(c => c.status === 'active') || challenges[0];
    challengeSelect.value = preferred.id;
    selectedChallenge = preferred;

    await loadEntries();
    showState('calendar');
}

challengeSelect.addEventListener('change', async () => {
    selectedChallenge = challenges.find(c => c.id === challengeSelect.value);
    await loadEntries();
});

/* ── Load entries for selected challenge ── */
async function loadEntries() {
    calendarChallengeName.textContent = selectedChallenge.name;

    const { data, error } = await supabaseClient
        .from('daily_entries')
        .select('*')
        .eq('challenge_id', selectedChallenge.id)
        .order('entry_date', { ascending: true });

    if (error) { console.error(error); return; }
    entries = data || [];
    buildEntryMap();

    // Default to the month of the most recent entry, else the challenge's start month, else today.
    const anchorDate = entries.length
        ? entries[entries.length - 1].entry_date
        : selectedChallenge.start_date || new Date().toISOString().slice(0, 10);
    const [y, m] = anchorDate.split('-').map(Number);
    viewYear = y;
    viewMonth = m - 1;

    closePopover();
    renderCalendar();
}

/* ── Build a date → stats map ── */
function buildEntryMap() {
    entryByDate = new Map();
    const startingBalance = Number(selectedChallenge.starting_balance);
    const rate = selectedChallenge.daily_target_percent / 100;

    entries.forEach((e, i) => {
        const prevBalance = i > 0 ? Number(entries[i - 1].balance) : startingBalance;
        const balance = Number(e.balance);
        const target = startingBalance * Math.pow(1 + rate, i + 1);
        const plDollar = balance - prevBalance;
        const plPct = prevBalance ? (plDollar / prevBalance) * 100 : 0;
        entryByDate.set(e.entry_date, {
            entry: e,
            balance,
            target,
            plDollar,
            plPct,
            hit: balance >= target
        });
    });
}

/* ── Month navigation ── */
prevMonthBtn.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    closePopover();
    renderCalendar();
});
nextMonthBtn.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    closePopover();
    renderCalendar();
});

/* ── Render month grid ── */
function renderCalendar() {
    monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    const startDate = selectedChallenge.start_date;
    const endDate = addDays(startDate, selectedChallenge.duration_days);

    let html = '';
    for (let cell = 0; cell < totalCells; cell++) {
        const dayNum = cell - firstWeekday + 1;

        if (dayNum < 1 || dayNum > daysInMonth) {
            html += `<div class="cal-cell cal-cell-pad"></div>`;
            continue;
        }

        const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(dayNum)}`;
        const inRange = dateStr >= startDate && dateStr <= endDate;
        const stats = entryByDate.get(dateStr);

        let dotClass = 'cal-dot-none';
        let extra = '';
        if (stats) {
            dotClass = stats.hit ? 'cal-dot-hit' : 'cal-dot-miss';
            extra = `
                <span class="cal-balance">${fmtMoney(stats.balance)}</span>
                <span class="cal-pl ${stats.plDollar >= 0 ? 'positive' : 'negative'}">${fmtPct(stats.plPct)}</span>`;
        }

        html += `
            <button type="button" class="cal-cell ${inRange ? '' : 'cal-cell-outside'}" data-date="${dateStr}">
                <span class="cal-daynum">${dayNum}</span>
                <span class="cal-dot ${dotClass}"></span>
                ${extra}
            </button>`;
    }

    calendarGrid.innerHTML = html;
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/* ── Click a day → popover ── */
calendarGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell:not(.cal-cell-pad)');
    if (!cell) return;
    const dateStr = cell.dataset.date;
    const stats = entryByDate.get(dateStr);

    popDate.textContent = formatLongDate(dateStr);

    if (stats) {
        popBody.innerHTML = `
            <div class="day-pop-row"><span>Balance</span><span>${fmtMoney(stats.balance)}</span></div>
            <div class="day-pop-row"><span>P/L $</span><span class="${stats.plDollar >= 0 ? 'positive' : 'negative'}">${stats.plDollar >= 0 ? '+' : ''}${fmtMoney(stats.plDollar)}</span></div>
            <div class="day-pop-row"><span>P/L %</span><span class="${stats.plDollar >= 0 ? 'positive' : 'negative'}">${fmtPct(stats.plPct)}</span></div>
            <div class="day-pop-row"><span>Target</span><span>${fmtMoney(stats.target)}</span></div>
            <div class="day-pop-row"><span>vs Target</span><span class="${stats.hit ? 'positive' : 'negative'}">${stats.hit ? 'Hit' : 'Missed'}</span></div>
            ${stats.entry.note ? `<p class="day-pop-note">${escapeHtml(stats.entry.note)}</p>` : ''}
        `;
    } else {
        popBody.innerHTML = `<p class="day-pop-note">No entry logged for this day.</p>`;
    }

    positionPopover(cell);
    dayPopover.classList.remove('hidden');
});

function formatLongDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function positionPopover(cell) {
    const rect = cell.getBoundingClientRect();
    const popW = 220;
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
    const top = rect.bottom + window.scrollY + 8;
    dayPopover.style.left = `${left}px`;
    dayPopover.style.top = `${top}px`;
}

function closePopover() {
    dayPopover.classList.add('hidden');
}

document.addEventListener('click', (e) => {
    if (dayPopover.classList.contains('hidden')) return;
    if (dayPopover.contains(e.target) || e.target.closest('.cal-cell')) return;
    closePopover();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopover();
});

/* ── Auth state ── */
supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    if (!currentUser) { showState('out'); return; }
    loadChallenges();
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
    currentUser = session ? session.user : null;
    if (!currentUser) showState('out'); else loadChallenges();
});
