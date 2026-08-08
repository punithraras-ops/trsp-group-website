document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.rate-ticket-form').forEach((form) => {
        const ratingInput = form.querySelector('.rating-input');
        const stars = form.querySelectorAll('.rating-stars [data-star]');

        function setStars(n) {
            ratingInput.value = n;
            stars.forEach((star) => {
                const val = parseInt(star.dataset.star, 10);
                star.className = val <= n ? 'fas fa-star fs-5 text-warning me-1' : 'far fa-star fs-5 text-warning me-1';
            });
        }

        setStars(5);
        stars.forEach((star) => {
            star.addEventListener('click', () => setStars(parseInt(star.dataset.star, 10)));
        });
    });
});
