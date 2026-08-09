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

    document.querySelectorAll('[data-pay-ticket]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (typeof Razorpay === 'undefined') return;
            const ticketId = btn.dataset.payTicket;
            const statusBox = document.querySelector(`[data-ticket-pay-status="${ticketId}"]`);
            const showStatus = (message, type) => {
                if (!statusBox) return;
                statusBox.textContent = message;
                statusBox.className = `alert alert-${type} py-2`;
            };

            btn.disabled = true;
            showStatus('Preparing payment...', 'info');

            try {
                const createResponse = await fetch(`/api/tickets/${ticketId}/create-payment-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                });
                const order = await createResponse.json();
                if (!createResponse.ok) {
                    throw new Error(order.error || 'Unable to start payment.');
                }

                const rzp = new Razorpay({
                    key: order.key,
                    amount: order.amount,
                    currency: order.currency,
                    name: order.companyName,
                    description: order.productTitle,
                    order_id: order.razorpayOrderId,
                    handler: async (response) => {
                        showStatus('Verifying payment...', 'info');
                        try {
                            const verifyResponse = await fetch(`/api/tickets/${ticketId}/verify-payment`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                                body: JSON.stringify(response),
                            });
                            const result = await verifyResponse.json();
                            if (!verifyResponse.ok) {
                                throw new Error(result.error || 'Payment verification failed.');
                            }
                            showStatus('Payment successful! Refreshing...', 'success');
                            window.location.reload();
                        } catch (error) {
                            showStatus(error.message, 'danger');
                            btn.disabled = false;
                        }
                    },
                    modal: {
                        ondismiss: () => {
                            btn.disabled = false;
                            showStatus('Payment cancelled.', 'warning');
                        },
                    },
                });
                rzp.open();
                showStatus('', 'info');
            } catch (error) {
                showStatus(error.message, 'danger');
                btn.disabled = false;
            }
        });
    });
});
