(function () {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    var ctx = null;

    function playClick() {
        try {
            if (!ctx) ctx = new AudioCtx();
            if (ctx.state === 'suspended') ctx.resume();

            var now = ctx.currentTime;
            var oscillator = ctx.createOscillator();
            var gain = ctx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(720, now);
            oscillator.frequency.exponentialRampToValueAtTime(420, now + 0.05);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.06, now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.start(now);
            oscillator.stop(now + 0.1);
        } catch (error) {
            // Audio not available; fail silently.
        }
    }

    document.addEventListener('click', function (event) {
        var target = event.target.closest('button, .btn, .nav-link');
        if (target && !target.disabled) {
            playClick();
        }
    }, true);
})();
