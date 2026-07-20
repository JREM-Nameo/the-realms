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
   Pass an actual day-count. If you have a date instead of a day-count
   (an entry's entry_date, or today), use targetForDate() below instead —
   it converts the date to the right day-count relative to start_date. */
export function targetForDay(challenge, dayNumber) {
    const rate = challenge.daily_target_percent / 100;
    return Number(challenge.starting_balance) * Math.pow(1 + rate, dayNumber);
}

export function finalTarget(challenge) {
    return targetForDay(challenge, challenge.duration_days);
}

/* ── Target based on an actual calendar date rather than entry position ──
   Use this whenever you have a real date (an entry's entry_date, or today).
   start_date itself is day 1 (not day 0) — the first day's target applies
   immediately, it doesn't wait for a full day to elapse. Correctly accounts
   for skipped days too: a day with no entry still counts toward the
   compounding, since the target tracks the calendar, not the log. */
export function targetForDate(challenge, dateStr) {
    return targetForDay(challenge, daysBetween(challenge.start_date, dateStr) + 1);
}

/* ── Days completed, based on the calendar (not entry count) ──
   A day counts as "completed" once it has passed, whether or not it was
   logged — start_date itself is day 1. Capped at duration_days so a
   long-finished challenge doesn't read as "45/30 days". */
export function daysCompletedForChallenge(challenge) {
    const today = todayStr();
    if (today < challenge.start_date) return 0;
    const elapsed = daysBetween(challenge.start_date, today) + 1;
    return Math.min(elapsed, challenge.duration_days);
}

/* ── Streak, based on the calendar (not entry count) ──
   Walks backward one calendar day at a time from today (or the challenge's
   final day, if it has already ended) and counts consecutive days that were
   both logged AND met that day's target. A skipped day breaks the streak
   exactly like a logged-but-missed day does — it doesn't just freeze. */
export function computeStreak(challenge, entries) {
    const balanceByDate = new Map(entries.map(e => [e.entry_date, Number(e.balance)]));

    const startDate = challenge.start_date;
    const endDate = addDays(startDate, challenge.duration_days - 1);
    const today = todayStr();
    let cursor = today < endDate ? today : endDate;
    if (cursor < startDate) return 0;

    let streak = 0;
    while (cursor >= startDate) {
        const balance = balanceByDate.get(cursor);
        if (balance === undefined || balance < targetForDate(challenge, cursor)) break;
        streak++;
        cursor = addDays(cursor, -1);
    }
    return streak;
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
