document.addEventListener('DOMContentLoaded', () => {
    const payButton = document.getElementById('payNowBtn');
    const payUpiButton = document.getElementById('payUpiBtn');
    const payManualUpiButton = document.getElementById('payManualUpiBtn');
    const manualUpiPanel = document.getElementById('manualUpiPanel');

    if (!payButton && !payUpiButton && !payManualUpiButton) {
        return;
    }

    const statusBox = document.querySelector('[data-checkout-status]');
    const productId = (payButton || payUpiButton || payManualUpiButton).dataset.productId;
    let appliedCouponCode = null;

    const showStatus = (message, type) => {
        if (!statusBox) return;
        statusBox.textContent = message;
        statusBox.className = `alert alert-${type}`;
    };

    if (payManualUpiButton && manualUpiPanel) {
        payManualUpiButton.addEventListener('click', async () => {
            payManualUpiButton.disabled = true;
            showStatus('Generating your UPI QR code...', 'info');
            try {
                const createResponse = await fetch('/api/checkout/create-manual-upi-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                    body: JSON.stringify({ productId, couponCode: appliedCouponCode || undefined }),
                });
                const order = await createResponse.json();
                if (!createResponse.ok) {
                    throw new Error(order.error || 'Unable to generate UPI QR code.');
                }

                manualUpiPanel.classList.remove('d-none');
                manualUpiPanel.innerHTML = `
                    <img src="${order.qrDataUrl}" alt="UPI QR Code" style="width:220px;height:220px;">
                    <p class="mt-2 mb-1"><strong>Scan with any UPI app</strong></p>
                    <p class="text-muted small mb-1">UPI ID: ${order.upiId}</p>
                    <p class="fw-bold mb-3">Amount: &#8377;${(order.amount / 100).toLocaleString('en-IN')}</p>
                    <div class="input-group mb-2">
                        <input type="text" class="form-control" id="utrInput" placeholder="Enter UPI transaction / UTR number after paying">
                        <button class="btn btn-primary" id="submitUtrBtn" type="button">Submit</button>
                    </div>
                    <div class="small" id="utrStatus"></div>
                `;
                showStatus('', 'info');

                document.getElementById('submitUtrBtn').addEventListener('click', async () => {
                    const utr = document.getElementById('utrInput').value.trim();
                    const utrStatus = document.getElementById('utrStatus');
                    if (!utr) {
                        utrStatus.textContent = 'Please enter your transaction reference number.';
                        utrStatus.className = 'small text-danger';
                        return;
                    }
                    utrStatus.textContent = 'Submitting...';
                    utrStatus.className = 'small text-muted';
                    try {
                        const submitResponse = await fetch(`/api/checkout/manual-upi/${order.orderId}/submit-utr`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                            body: JSON.stringify({ utr }),
                        });
                        const result = await submitResponse.json();
                        if (!submitResponse.ok) {
                            throw new Error(result.error || 'Unable to submit reference.');
                        }
                        utrStatus.textContent = "Reference submitted! We'll confirm your payment shortly — check your Account page for updates.";
                        utrStatus.className = 'small text-success';
                        document.getElementById('utrInput').disabled = true;
                        document.getElementById('submitUtrBtn').disabled = true;
                    } catch (error) {
                        utrStatus.textContent = error.message;
                        utrStatus.className = 'small text-danger';
                    }
                });
            } catch (error) {
                showStatus(error.message, 'danger');
            } finally {
                payManualUpiButton.disabled = false;
            }
        });
    }

    if ((!payButton && !payUpiButton) || typeof Razorpay === 'undefined') {
        return;
    }

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
