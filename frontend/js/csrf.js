function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
}
