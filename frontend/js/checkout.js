document.addEventListener('DOMContentLoaded', () => {
    const payButton = document.getElementById('payNowBtn');
    if (!payButton || typeof Razorpay === 'undefined') {
        return;
    }

    const statusBox = document.querySelector('[data-checkout-status]');
    let appliedCouponCode = null;

    const showStatus = (message, type) => {
        if (!statusBox) return;
        statusBox.textContent = message;
        statusBox.className = `alert alert-${type}`;
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId: payButton.dataset.productId, code }),
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

    payButton.addEventListener('click', async () => {
        payButton.disabled = true;
        showStatus('Preparing your order...', 'info');

        try {
            const createResponse = await fetch('/api/checkout/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: payButton.dataset.productId, couponCode: appliedCouponCode || undefined }),
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
                handler: async response => {
                    showStatus('Verifying payment...', 'info');
                    try {
                        const verifyResponse = await fetch('/api/checkout/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
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
                        payButton.disabled = false;
                    }
                },
                modal: {
                    ondismiss: () => {
                        payButton.disabled = false;
                        showStatus('Payment cancelled.', 'warning');
                    },
                },
            });

            rzp.open();
            showStatus('', 'info');
        } catch (error) {
            showStatus(error.message, 'danger');
            payButton.disabled = false;
        }
    });
});
