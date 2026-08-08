document.addEventListener('DOMContentLoaded', () => {
    const payButton = document.getElementById('payNowBtn');
    const payUpiButton = document.getElementById('payUpiBtn');
    if ((!payButton && !payUpiButton) || typeof Razorpay === 'undefined') {
        return;
    }

    const statusBox = document.querySelector('[data-checkout-status]');
    const productId = (payButton || payUpiButton).dataset.productId;
    let appliedCouponCode = null;

    const showStatus = (message, type) => {
        if (!statusBox) return;
        statusBox.textContent = message;
        statusBox.className = `alert alert-${type}`;
    };

    const setButtonsDisabled = (disabled) => {
        if (payButton) payButton.disabled = disabled;
        if (payUpiButton) payUpiButton.disabled = disabled;
    };

    const applyCouponBtn = document.getElementById('applyCouponBtn');
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', async () => {
            const code = document.getElementById('couponInput').value.trim();
            const couponStatus = document.getElementById('couponStatus');
            if (!code) return;
            couponStatus.textContent = 'Checking coupon...';
            couponStatus.className = 'small mb-3 text-muted';
            try {
                const response = await fetch('/api/checkout/apply-coupon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                    body: JSON.stringify({ productId, code }),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Invalid coupon.');
                }
                appliedCouponCode = code;
                couponStatus.textContent = `Coupon applied! New total: ₹${(result.finalAmountPaise / 100).toLocaleString('en-IN')}`;
                couponStatus.className = 'small mb-3 text-success';
            } catch (error) {
                appliedCouponCode = null;
                couponStatus.textContent = error.message;
                couponStatus.className = 'small mb-3 text-danger';
            }
        });
    }

    async function startCheckout(useUpiOnly) {
        setButtonsDisabled(true);
        showStatus('Preparing your order...', 'info');

        try {
            const createResponse = await fetch('/api/checkout/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                body: JSON.stringify({ productId, couponCode: appliedCouponCode || undefined }),
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
                handler: async response => {
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

                        showStatus('Payment successful. Redirecting...', 'success');
                        window.location.href = '/account';
                    } catch (error) {
                        showStatus(error.message, 'danger');
                        setButtonsDisabled(false);
                    }
                },
                modal: {
                    ondismiss: () => {
                        setButtonsDisabled(false);
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
            setButtonsDisabled(false);
        }
    }

    if (payButton) payButton.addEventListener('click', () => startCheckout(false));
    if (payUpiButton) payUpiButton.addEventListener('click', () => startCheckout(true));
});
