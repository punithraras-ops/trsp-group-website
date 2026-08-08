window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        autoDisplay: false,
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE
    }, 'google_translate_element');
};

(function () {
    var script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.body.appendChild(script);
})();

function trspSetLanguage(lang) {
    var combo = document.querySelector('.goog-te-combo');
    if (combo) {
        combo.value = lang;
        combo.dispatchEvent(new Event('change'));
        return;
    }
    // Widget not ready yet (or page not translated before): set the cookie
    // Google Translate reads on load, then reload so it applies immediately.
    var cookieValue = lang === 'en' ? '' : '/en/' + lang;
    var hostParts = window.location.hostname.split('.');
    var domainScope = hostParts.length > 2 ? '.' + hostParts.slice(-2).join('.') : window.location.hostname;
    document.cookie = 'googtrans=' + cookieValue + '; path=/';
    document.cookie = 'googtrans=' + cookieValue + '; path=/; domain=' + domainScope;
    window.location.reload();
}

document.addEventListener('DOMContentLoaded', function () {
    var current = (document.cookie.match(/googtrans=\/en\/([a-zA-Z-]+)/) || [])[1] || 'en';
    document.querySelectorAll('.lang-dropdown-menu [data-lang]').forEach(function (item) {
        if (item.getAttribute('data-lang') === current) {
            item.classList.add('active');
        }
        item.addEventListener('click', function (e) {
            e.preventDefault();
            trspSetLanguage(item.getAttribute('data-lang'));
        });
    });
});
