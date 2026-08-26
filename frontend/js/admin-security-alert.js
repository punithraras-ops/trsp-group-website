document.addEventListener('DOMContentLoaded', () => {
    const el = document.querySelector('[data-security-alert-count]');
    if (!el) return;

    fetch('/admin/security-center/alert-count')
        .then((res) => res.json())
        .then((data) => {
            el.textContent = data.count;
        })
        .catch(() => {
            el.textContent = '-';
        });
});
