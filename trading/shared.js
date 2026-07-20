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

/* ── Challenge date range ──
   start_date is day 1 of the challenge; the challenge covers duration_days
   calendar days total, so the last day is start_date + (duration_days - 1). */
export function challengeEndDate(challenge) {
    return addDays(challenge.start_date, challenge.duration_days - 1);
}

/* ── How many calendar days of the challenge have actually elapsed ──
   Based on today's real date vs start_date, not on how many entries were
   logged. Clamped to [0, duration_days] so it never goes negative or past
   the challenge length. */
export function daysElapsed(challenge) {
    const raw = daysBetween(challenge.start_date, todayStr()) + 1;
    return Math.min(challenge.duration_days, Math.max(0, raw));
}

/* ── Classify a single calendar day for a challenge ──
   entry: the daily_entries row for that date, or null/undefined if none.
   Returns one of:
     'hit'      - logged, balance met or beat that day's target
     'miss'     - logged, balance came in under target
     'missed'   - no entry, and the day has already passed (i.e. a skipped day)
     'pending'  - no entry, but it's today (still time to log)
     'upcoming' - no entry, day hasn't arrived yet
     'outside'  - date falls outside the challenge's start–end range */
export function dayStatus(challenge, dateStr, entry) {
    const start = challenge.start_date;
    const end = challengeEndDate(challenge);
    if (dateStr < start || dateStr > end) return 'outside';

    if (entry) {
        const target = targetForDate(challenge, dateStr);
        return Number(entry.balance) >= target ? 'hit' : 'miss';
    }

    const today = todayStr();
    if (dateStr < today) return 'missed';
    if (dateStr === today) return 'pending';
    return 'upcoming';
}

/* ── Current streak, based on consecutive calendar days ──
   Counts backward from today (or from yesterday if today isn't logged yet,
   giving a same-day grace period) as long as each day has a logged entry.
   A skipped day breaks the streak immediately, unlike counting entries
   alone which ignores gaps in the calendar. */
export function computeStreak(entries) {
    const loggedDates = new Set(entries.map(e => e.entry_date));
    if (!loggedDates.size) return 0;

    let cursor = todayStr();
    if (!loggedDates.has(cursor)) cursor = addDays(cursor, -1);

    let streak = 0;
    while (loggedDates.has(cursor)) {
        streak++;
        cursor = addDays(cursor, -1);
    }
    return streak;
}

/* ── Styled confirm modal ──
   Replaces window.confirm(), which pops up as a jarring native browser
   dialog that doesn't match the rest of the UI. Usage mirrors confirm():
   const ok = await showConfirm({ title, message, confirmLabel, cancelLabel, danger });
   if (!ok) return; */
export function showConfirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'overlay confirm-overlay active';
        overlay.innerHTML = `
            <div class="qr-card confirm-card">
                <p class="qr-title confirm-title">${title}</p>
                <p class="confirm-message">${message}</p>
                <div class="confirm-actions">
                    <button type="button" class="chip-btn confirm-cancel">${cancelLabel}</button>
                    <button type="button" class="btn-primary confirm-ok${danger ? ' confirm-danger' : ''}">${confirmLabel}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        function cleanup(result) {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            document.body.style.overflow = '';
            resolve(result);
        }
        function onKey(e) {
            if (e.key === 'Escape') cleanup(false);
        }

        overlay.querySelector('.confirm-cancel').addEventListener('click', () => cleanup(false));
        overlay.querySelector('.confirm-ok').addEventListener('click', () => cleanup(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
        document.addEventListener('keydown', onKey);
    });
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
