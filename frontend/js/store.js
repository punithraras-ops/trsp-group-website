document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-add-to-cart]').forEach((btn) => {
        btn.addEventListener('click', () => {
            TrspCart.addToCart(btn.dataset.addToCart, 1);
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-check';
                setTimeout(() => { icon.className = 'fas fa-cart-plus'; }, 1200);
            }
        });
    });

    const modalEl = document.getElementById('reviewsModal');
    if (!modalEl || typeof bootstrap === 'undefined') {
        return;
    }
    const modal = new bootstrap.Modal(modalEl);
    const titleEl = document.getElementById('reviewsModalTitle');
    const listEl = document.getElementById('reviewsList');
    const formWrap = document.getElementById('reviewFormWrap');
    const starInput = document.getElementById('reviewStarInput');
    const commentEl = document.getElementById('reviewComment');
    const submitBtn = document.getElementById('submitReviewBtn');
    const statusEl = document.getElementById('reviewSubmitStatus');
    let currentProductId = null;
    let selectedRating = 5;

    function renderStars(rating) {
        return Array.from({ length: 5 }, (_, i) => `<i class="fa-star ${i < Math.round(rating) ? 'fas text-warning' : 'far text-muted'}"></i>`).join('');
    }

    function setSelectedStars(n) {
        selectedRating = n;
        starInput.querySelectorAll('[data-star]').forEach((star) => {
            const val = parseInt(star.dataset.star, 10);
            star.className = val <= n ? 'fas fa-star fs-5 text-warning me-1' : 'far fa-star fs-5 text-warning me-1';
        });
    }

    starInput.querySelectorAll('[data-star]').forEach((star) => {
        star.style.cursor = 'pointer';
        star.addEventListener('click', () => setSelectedStars(parseInt(star.dataset.star, 10)));
    });

    async function loadReviews(productId) {
        listEl.innerHTML = '<p class="text-muted">Loading...</p>';
        formWrap.classList.add('d-none');
        statusEl.textContent = '';

        try {
            const response = await fetch(`/api/products/${productId}/reviews`);
            const data = await response.json();

            if (!data.reviews || data.reviews.length === 0) {
                listEl.innerHTML = '<p class="text-muted">No reviews yet.</p>';
            } else {
                listEl.innerHTML = data.reviews.map(r => `
                    <div class="mb-3 pb-3 border-bottom">
                        <div class="d-flex justify-content-between">
                            <strong>${r.user_name}</strong>
                            <span>${renderStars(r.rating)}</span>
                        </div>
                        ${r.comment ? `<p class="text-muted mb-0 mt-1">${r.comment}</p>` : ''}
                    </div>
                `).join('');
            }

            if (data.canReview) {
                formWrap.classList.remove('d-none');
                setSelectedStars(5);
                commentEl.value = '';
            }
        } catch (error) {
            listEl.innerHTML = '<p class="text-danger">Unable to load reviews right now.</p>';
        }
    }

    document.querySelectorAll('[data-open-reviews]').forEach((btn) => {
        btn.addEventListener('click', () => {
            currentProductId = btn.dataset.openReviews;
            titleEl.textContent = `Reviews - ${btn.dataset.productTitle}`;
            modal.show();
            loadReviews(currentProductId);
        });
    });

    submitBtn.addEventListener('click', async () => {
        if (!currentProductId) return;
        submitBtn.disabled = true;
        statusEl.textContent = 'Submitting...';
        statusEl.className = 'small mt-2 text-muted';

        try {
            const response = await fetch(`/api/products/${currentProductId}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: selectedRating, comment: commentEl.value }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Unable to submit review.');
            }
            statusEl.textContent = 'Thanks for your review!';
            statusEl.className = 'small mt-2 text-success';
            loadReviews(currentProductId);
        } catch (error) {
            statusEl.textContent = error.message;
            statusEl.className = 'small mt-2 text-danger';
            submitBtn.disabled = false;
        }
    });
});
