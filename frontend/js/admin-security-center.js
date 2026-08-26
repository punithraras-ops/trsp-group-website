document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.querySelector('[data-scan-button]');
    if (!scanButton) return;

    scanButton.closest('form').addEventListener('submit', () => {
        scanButton.disabled = true;
        scanButton.textContent = 'Scanning... this can take up to a minute';
    });
});
