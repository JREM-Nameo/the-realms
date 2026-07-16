/* ── QR popup ── */
function toggleQR() {
    const el = document.getElementById('qrPopup');
    const opening = !el.classList.contains('active');
    el.classList.toggle('active');
    document.body.style.overflow = opening ? 'hidden' : '';
}

function handleOverlayClick(e) {
    if (e.target === e.currentTarget) toggleQR();
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const el = document.getElementById('qrPopup');
        if (el.classList.contains('active')) toggleQR();
    }
});

/* ── Animated dot grid ── */
(function () {
    const canvas = document.getElementById('dotGrid');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const SPACING = 28;
    const DOT_R = 1.2;
    const BLUE = [59, 130, 246];
    let W, H, cols, rows, mouse = { x: -999, y: -999 };

    function resize() {
        W = canvas.width  = canvas.offsetWidth;
        H = canvas.height = canvas.offsetHeight;
        cols = Math.ceil(W / SPACING) + 1;
        rows = Math.ceil(H / SPACING) + 1;
    }

    window.addEventListener('resize', resize);
    resize();

    const container = canvas.closest('.page-body');
    container.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });
    container.addEventListener('mouseleave', () => {
        mouse.x = -999; mouse.y = -999;
    });

    function draw() {
        ctx.clearRect(0, 0, W, H);
        const offsetX = (W % SPACING) / 2;
        const offsetY = (H % SPACING) / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = offsetX + c * SPACING;
                const y = offsetY + r * SPACING;
                const dist = Math.hypot(x - mouse.x, y - mouse.y);
                const reach = 100;
                const strength = Math.max(0, 1 - dist / reach);
                const alpha = 0.18 + strength * 0.65;
                const radius = DOT_R + strength * 1.4;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${BLUE[0]},${BLUE[1]},${BLUE[2]},${alpha})`;
                ctx.fill();
            }
        }
        requestAnimationFrame(draw);
    }

    draw();
})();