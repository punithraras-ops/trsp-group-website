document.addEventListener('DOMContentLoaded', () => {
    const toast = document.querySelector('[data-auto-toast]');
    if (toast) {
        setTimeout(() => toast.remove(), 4000);
        if (window.history.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.delete('ordersCleared');
            window.history.replaceState({}, '', url);
        }
    }

    const statusBox = document.querySelector('[data-retry-status]');

    const showStatus = (message, type) => {
        if (!statusBox) return;
        statusBox.textContent = message;
        statusBox.className = `alert alert-${type}`;
    };

    document.querySelectorAll('[data-retry-payment]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (typeof Razorpay === 'undefined') {
                showStatus('Payments are not available right now.', 'danger');
                return;
            }

            const orderId = btn.dataset.retryPayment;
            btn.disabled = true;
            showStatus('Preparing your payment...', 'info');

            try {
                const createResponse = await fetch(`/api/checkout/retry/${orderId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                });
                const order = await createResponse.json();
                if (!createResponse.ok) {
                    throw new Error(order.error || 'Unable to start checkout.');
                }

                const rzp = new Razorpay({
                    key: order.key,
                    amount: order.amount,
                    currency: order.currency,
                    name: order.companyName,
                    description: order.productTitle,
                    order_id: order.razorpayOrderId,
                    config: {
                        display: {
                            blocks: {
                                upi: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] },
                                other: { name: 'Other ways to pay', instruments: [{ method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }] },
                            },
                            sequence: ['block.upi', 'block.other'],
                            preferences: { show_default_blocks: false },
                        },
                    },
                    method: { upi: true, card: true, netbanking: true, wallet: true },
                    handler: async (response) => {
                        showStatus('Verifying payment...', 'info');
                        try {
                            const verifyResponse = await fetch('/api/checkout/verify', {
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
