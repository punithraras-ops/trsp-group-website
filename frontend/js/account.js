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

    async function retryPayment(btn, orderId, useUpiOnly) {
        if (typeof Razorpay === 'undefined') {
            showStatus('Payments are not available right now.', 'danger');
            return;
        }

        const siblingBtn = btn.parentElement.querySelector(
            useUpiOnly ? '[data-retry-payment]' : '[data-retry-payment-upi]'
        );
        btn.disabled = true;
        if (siblingBtn) siblingBtn.disabled = true;
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

            const rzpOptions = {
                key: order.key,
                amount: order.amount,
                currency: order.currency,
                name: order.companyName,
                description: order.productTitle,
                order_id: order.razorpayOrderId,
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
                        if (siblingBtn) siblingBtn.disabled = false;
                    }
                },
                modal: {
                    ondismiss: () => {
                        btn.disabled = false;
                        if (siblingBtn) siblingBtn.disabled = false;
                        showStatus('Payment cancelled.', 'warning');
                    },
                },
            };

            if (useUpiOnly) {
                rzpOptions.method = { upi: '1', card: '0', netbanking: '0', wallet: '0', emi: '0', paylater: '0' };
            }

            const rzp = new Razorpay(rzpOptions);
            rzp.open();
            showStatus('', 'info');
        } catch (error) {
            showStatus(error.message, 'danger');
            btn.disabled = false;
            if (siblingBtn) siblingBtn.disabled = false;
        }
    }

    document.querySelectorAll('[data-retry-payment]').forEach((btn) => {
        btn.addEventListener('click', () => retryPayment(btn, btn.dataset.retryPayment, false));
    });

    document.querySelectorAll('[data-retry-payment-upi]').forEach((btn) => {
        btn.addEventListener('click', () => retryPayment(btn, btn.dataset.retryPaymentUpi, true));
    });
});
