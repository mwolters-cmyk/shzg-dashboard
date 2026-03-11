/* ───── SHZG Dashboard — PIN-lock ───── */
(function () {
    'use strict';

    // SHA-256 hash of the correct PIN (4 digits)
    const PIN_HASH = 'f72b71f2cf7221d17e8e7dcb23ba1aebadee8813fb843860fa6894b9c658269c';
    const SESSION_KEY = 'shzg_dash_auth';

    // Quick SHA-256 using SubtleCrypto
    async function sha256(msg) {
        const buf = await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(msg));
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Already authenticated this session?
    if (sessionStorage.getItem(SESSION_KEY) === 'ok') return;

    // Hide page content
    document.documentElement.style.visibility = 'hidden';

    document.addEventListener('DOMContentLoaded', function () {
        // Build lock overlay
        const overlay = document.createElement('div');
        overlay.id = 'pin-overlay';
        overlay.innerHTML = `
            <div class="pin-box">
                <h2>SHZG Dashboard</h2>
                <p>Voer de pincode in om door te gaan</p>
                <div class="pin-input-row">
                    <input type="password" id="pin-1" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
                    <input type="password" id="pin-2" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
                    <input type="password" id="pin-3" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
                    <input type="password" id="pin-4" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="off">
                </div>
                <p id="pin-error" class="pin-error"></p>
                <button id="pin-submit">Openen</button>
            </div>
        `;
        document.body.prepend(overlay);
        document.documentElement.style.visibility = 'visible';

        const inputs = [1, 2, 3, 4].map(i => document.getElementById('pin-' + i));
        const errEl = document.getElementById('pin-error');
        const btn = document.getElementById('pin-submit');

        // Auto-advance between boxes
        inputs.forEach((inp, i) => {
            inp.addEventListener('input', () => {
                inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
                if (inp.value && i < 3) inputs[i + 1].focus();
            });
            inp.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !inp.value && i > 0) {
                    inputs[i - 1].focus();
                }
                if (e.key === 'Enter') btn.click();
            });
        });

        inputs[0].focus();

        btn.addEventListener('click', async function () {
            const pin = inputs.map(i => i.value).join('');
            if (pin.length !== 4) { errEl.textContent = 'Vul 4 cijfers in'; return; }
            const hash = await sha256(pin);
            if (hash === PIN_HASH) {
                sessionStorage.setItem(SESSION_KEY, 'ok');
                overlay.remove();
            } else {
                errEl.textContent = 'Onjuiste pincode';
                inputs.forEach(i => { i.value = ''; });
                inputs[0].focus();
            }
        });
    });
})();
