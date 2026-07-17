/* ── Shared helpers used across all Trading pages ──
   (dashboard, progress, analytics, calendar, challenges)
   Keeping this in one place means a fix here fixes every page at once. */

/* ── Date helpers ── */
export const pad2 = (n) => String(n).padStart(2, '0');
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function daysBetween(a, b) {
    const MS = 24 * 60 * 60 * 1000;
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / MS);
}

export function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/* ── Formatting ── */
export const fmtMoney = (n) =>
    '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ── Target-balance formula ──
   dayNumber is 1-based (dayNumber=1 → the first day's target).
   targetForDay(challenge, 0) === starting_balance.
   NOTE: this currently compounds off *entry position*, not elapsed calendar
   days, so skipped days aren't accounted for. Tracked as a follow-up fix —
   changing it here will fix it everywhere at once. */
export function targetForDay(challenge, dayNumber) {
    const rate = challenge.daily_target_percent / 100;
    return Number(challenge.starting_balance) * Math.pow(1 + rate, dayNumber);
}

export function finalTarget(challenge) {
    return targetForDay(challenge, challenge.duration_days);
}

/* ── Generic state switcher ──
   const showState = makeStateSwitcher({ loading: loadingEl, out: signedOutEl, ... });
   showState('out') hides every other element and shows signedOutEl. */
export function makeStateSwitcher(states) {
    return function showState(name) {
        for (const key in states) {
            states[key].classList.toggle('hidden', key !== name);
        }
    };
}

/* ── Challenge loading (Progress / Analytics / Calendar share this pattern) ── */
export async function fetchUserChallenges(supabaseClient, userId) {
    const { data, error } = await supabaseClient
        .from('challenges')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export function populateChallengeSelect(selectEl, challenges) {
    selectEl.innerHTML = challenges.map(c =>
        `<option value="${c.id}">${escapeHtml(c.name)} (${c.status})</option>`
    ).join('');
}

export function pickPreferredChallenge(challenges) {
    return challenges.find(c => c.status === 'active') || challenges[0];
}
