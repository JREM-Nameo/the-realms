import { supabaseClient } from '../js/auth.js';
import {
    fmtMoney, fmtPct, targetForDay, finalTarget, makeStateSwitcher,
    fetchUserChallenges, populateChallengeSelect, pickPreferredChallenge
} from './shared.js';

const loadingState     = document.getElementById('loadingState');
const signedOutState   = document.getElementById('signedOutState');
const noChallengeState = document.getElementById('noChallengeState');
const analyticsState   = document.getElementById('analyticsState');
const gateSignInBtn    = document.getElementById('gateSignInBtn');
const challengeSelect  = document.getElementById('challengeSelect');
const analyticsChallengeName = document.getElementById('analyticsChallengeName');

const chartContainer   = document.getElementById('chartContainer');
const noEntriesMsg     = document.getElementById('noEntriesMsg');

const statTotalReturn  = document.getElementById('statTotalReturn');
const statFinalTarget  = document.getElementById('statFinalTarget');
const statDaysLogged   = document.getElementById('statDaysLogged');

let currentUser = null;
let challenges = [];
let selectedChallenge = null;
let entries = [];

gateSignInBtn.addEventListener('click', () => window.toggleAuth());

/* ── View switching ── */
const showState = makeStateSwitcher({
    loading: loadingState,
    out: signedOutState,
    'no-challenge': noChallengeState,
    analytics: analyticsState
});

/* ── Load challenges, populate selector ── */
async function loadChallenges() {
    try {
        challenges = await fetchUserChallenges(supabaseClient, currentUser.id);
    } catch (error) {
        console.error(error);
        showState('no-challenge');
        return;
    }

    if (!challenges.length) {
        showState('no-challenge');
        return;
    }

    populateChallengeSelect(challengeSelect, challenges);
    const preferred = pickPreferredChallenge(challenges);
    challengeSelect.value = preferred.id;
    selectedChallenge = preferred;

    await loadEntries();
    showState('analytics');
}

challengeSelect.addEventListener('change', async () => {
    selectedChallenge = challenges.find(c => c.id === challengeSelect.value);
    await loadEntries();
});

/* ── Load entries for selected challenge ── */
async function loadEntries() {
    analyticsChallengeName.textContent = selectedChallenge.name;

    const { data, error } = await supabaseClient
        .from('daily_entries')
        .select('*')
        .eq('challenge_id', selectedChallenge.id)
        .order('entry_date', { ascending: true });

    if (error) { console.error(error); return; }
    entries = data || [];
    renderAnalytics();
}

/* ── Stats ── */
function renderStats() {
    const startingBalance = Number(selectedChallenge.starting_balance);
    const finalTargetVal = finalTarget(selectedChallenge);
    const currentBalance = entries.length ? Number(entries[entries.length - 1].balance) : startingBalance;
    const totalReturnPct = startingBalance ? ((currentBalance - startingBalance) / startingBalance) * 100 : 0;

    statTotalReturn.textContent = fmtPct(totalReturnPct);
    statTotalReturn.className = 'stat-value ' + (totalReturnPct >= 0 ? 'positive' : 'negative');
    statFinalTarget.textContent = fmtMoney(finalTargetVal);
    statDaysLogged.textContent = `${entries.length} / ${selectedChallenge.duration_days}`;
}

/* ── Build the SVG equity curve ── */
function buildChartSvg(challenge, entries) {
    const startingBalance = Number(challenge.starting_balance);
    const durationDays = Math.max(1, challenge.duration_days);

    // Target curve: one point per day from 0..durationDays
    const targetPoints = [];
    for (let d = 0; d <= durationDays; d++) {
        targetPoints.push({ x: d, y: targetForDay(challenge, d) });
    }

    // Actual curve: starting balance at day 0, then one point per logged entry in order
    const actualPoints = [{ x: 0, y: startingBalance }];
    entries.forEach((e, i) => {
        actualPoints.push({ x: i + 1, y: Number(e.balance) });
    });

    const allY = [...targetPoints.map(p => p.y), ...actualPoints.map(p => p.y)];
    const yMin = Math.min(...allY) * 0.97;
    const yMax = Math.max(...allY) * 1.03;
    const xMax = durationDays;

    const W = 860, H = 380;
    const marginLeft = 64, marginRight = 20, marginTop = 20, marginBottom = 34;
    const chartW = W - marginLeft - marginRight;
    const chartH = H - marginTop - marginBottom;

    const sx = (x) => marginLeft + (xMax > 0 ? (x / xMax) * chartW : 0);
    const sy = (y) => marginTop + chartH - ((y - yMin) / (yMax - yMin || 1)) * chartH;

    const targetPath = targetPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const actualPath = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

    const actualMarkers = actualPoints.map(p =>
        `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" class="chart-point" />`
    ).join('');

    // Y-axis ticks (4 evenly spaced)
    const yTickCount = 4;
    const yTicks = [];
    for (let i = 0; i <= yTickCount; i++) {
        const val = yMin + ((yMax - yMin) * i) / yTickCount;
        yTicks.push(val);
    }
    const yTickLines = yTicks.map(v => {
        const yPos = sy(v).toFixed(1);
        return `
            <line x1="${marginLeft}" y1="${yPos}" x2="${W - marginRight}" y2="${yPos}" class="chart-gridline" />
            <text x="${marginLeft - 10}" y="${yPos}" class="chart-axis-label" text-anchor="end" dominant-baseline="middle">${fmtMoney(v)}</text>
        `;
    }).join('');

    // X-axis ticks (day 0, 25%, 50%, 75%, 100%)
    const xTickFractions = [0, 0.25, 0.5, 0.75, 1];
    const xTickLines = xTickFractions.map(f => {
        const day = Math.round(xMax * f);
        const xPos = sx(day).toFixed(1);
        return `<text x="${xPos}" y="${H - marginBottom + 20}" class="chart-axis-label" text-anchor="middle">Day ${day}</text>`;
    }).join('');

    return `
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">
        ${yTickLines}
        <path d="${targetPath}" class="chart-line-target" fill="none" />
        <path d="${actualPath}" class="chart-line-actual" fill="none" />
        ${actualMarkers}
        ${xTickLines}
    </svg>`;
}

/* ── Render ── */
function renderAnalytics() {
    renderStats();

    if (!entries.length) {
        chartContainer.innerHTML = '';
        noEntriesMsg.classList.remove('hidden');
        return;
    }
    noEntriesMsg.classList.add('hidden');
    chartContainer.innerHTML = buildChartSvg(selectedChallenge, entries);
}

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
