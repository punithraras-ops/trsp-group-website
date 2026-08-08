document.addEventListener('DOMContentLoaded', async () => {
    const cartContent = document.getElementById('cartContent');
    const emptyState = document.getElementById('cartEmptyState');
    const itemsEl = document.getElementById('cartItems');
    if (!cartContent || !emptyState || !itemsEl) {
        return;
    }

    let appliedCoupon = null;
    let products = [];

    function formatMoney(paise) {
        return '₹' + (paise / 100).toLocaleString('en-IN');
    }

    function currentCartLines() {
        const cart = TrspCart.getCart();
        return cart
            .map(item => {
                const product = products.find(p => p.id === item.productId);
                return product ? { product, quantity: item.quantity } : null;
            })
            .filter(Boolean);
    }

    function subtotalPaise() {
        return currentCartLines().reduce((sum, line) => sum + line.product.price_paise * line.quantity, 0);
    }

    function renderTotals() {
        const subtotal = subtotalPaise();
        document.getElementById('cartSubtotal').textContent = formatMoney(subtotal);

        const discountRow = document.getElementById('cartDiscountRow');
        let total = subtotal;
        if (appliedCoupon) {
            document.getElementById('cartDiscount').textContent = '-' + formatMoney(appliedCoupon.discountPaise);
            discountRow.classList.remove('d-none');
            total = appliedCoupon.finalAmountPaise;
        } else {
            discountRow.classList.add('d-none');
        }
        document.getElementById('cartTotal').textContent = formatMoney(total);
    }

    function render() {
        const lines = currentCartLines();
        if (lines.length === 0) {
            cartContent.classList.add('d-none');
            emptyState.classList.remove('d-none');
            return;
        }
        cartContent.classList.remove('d-none');
        emptyState.classList.add('d-none');

        itemsEl.innerHTML = lines.map(({ product, quantity }) => `
            <div class="card border-0 shadow-sm rounded-4">
                <div class="card-body p-3 d-flex align-items-center gap-3">
                    ${product.images && product.images.length > 0 ? `<img src="/uploads/${product.images[0]}" class="rounded" style="width:64px;height:64px;object-fit:cover;">` : ''}
                    <div class="flex-grow-1">
                        <div class="fw-bold">${product.title}</div>
                        <div class="text-muted small">${formatMoney(product.price_paise)} each</div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-outline-secondary" data-qty-minus="${product.id}">-</button>
                        <span>${quantity}</span>
                        <button class="btn btn-sm btn-outline-secondary" data-qty-plus="${product.id}">+</button>
                    </div>
                    <button class="btn btn-sm btn-outline-danger" data-remove="${product.id}"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');

        appliedCoupon = null;
        document.getElementById('couponStatus').textContent = '';
        renderTotals();
    }

    async function loadProducts() {
        const cart = TrspCart.getCart();
        if (cart.length === 0) {
            render();
            return;
        }
        const ids = cart.map(item => item.productId).join(',');
        try {
            const response = await fetch(`/api/products/by-ids?ids=${encodeURIComponent(ids)}`);
            const data = await response.json();
            products = data.products || [];
        } catch (error) {
            products = [];
        }
        render();
    }

    itemsEl.addEventListener('click', (event) => {
        const plus = event.target.closest('[data-qty-plus]');
        const minus = event.target.closest('[data-qty-minus]');
        const remove = event.target.closest('[data-remove]');
        if (plus) {
            const id = plus.dataset.qtyPlus;
            const current = TrspCart.getCart().find(i => i.productId === id);
            TrspCart.updateQuantity(id, (current ? current.quantity : 0) + 1);
            render();
        } else if (minus) {
            const id = minus.dataset.qtyMinus;
            const current = TrspCart.getCart().find(i => i.productId === id);
            TrspCart.updateQuantity(id, (current ? current.quantity : 0) - 1);
            render();
        } else if (remove) {
            TrspCart.removeFromCart(remove.dataset.remove);
            render();
        }
    });

    const applyCouponBtn = document.getElementById('applyCouponBtn');
    if (applyCouponBtn) {
        applyCouponBtn.addEventListener('click', async () => {
            const code = document.getElementById('couponInput').value.trim();
            const statusEl = document.getElementById('couponStatus');
            if (!code) return;
            statusEl.textContent = 'Checking coupon...';
            statusEl.className = 'small mb-3 text-muted';
            try {
                const response = await fetch('/api/checkout/apply-coupon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                    body: JSON.stringify({ items: TrspCart.getCart(), code }),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Invalid coupon.');
                }
                appliedCoupon = { code, discountPaise: result.discountPaise, finalAmountPaise: result.finalAmountPaise };
                statusEl.textContent = 'Coupon applied!';
                statusEl.className = 'small mb-3 text-success';
                renderTotals();
            } catch (error) {
                appliedCoupon = null;
                statusEl.textContent = error.message;
                statusEl.className = 'small mb-3 text-danger';
                renderTotals();
            }
        });
    }

    const payManualUpiBtn = document.getElementById('cartPayManualUpiBtn');
    const manualUpiPanel = document.getElementById('manualUpiPanel');
    if (payManualUpiBtn && manualUpiPanel) {
        const statusBox = document.querySelector('[data-checkout-status]');
        const showManualStatus = (message, type) => {
            if (!statusBox) return;
            statusBox.textContent = message;
            statusBox.className = `alert alert-${type}`;
        };

        payManualUpiBtn.addEventListener('click', async () => {
            payManualUpiBtn.disabled = true;
            showManualStatus('Generating your UPI QR code...', 'info');
            try {
                const createResponse = await fetch('/api/checkout/create-manual-upi-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                    body: JSON.stringify({ items: TrspCart.getCart(), couponCode: appliedCoupon ? appliedCoupon.code : undefined }),
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
                showManualStatus('', 'info');

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
                        TrspCart.clearCart();
                    } catch (error) {
                        utrStatus.textContent = error.message;
                        utrStatus.className = 'small text-danger';
                    }
                });
            } catch (error) {
                showManualStatus(error.message, 'danger');
            } finally {
                payManualUpiBtn.disabled = false;
            }
        });
    }

    const payBtn = document.getElementById('cartPayBtn');
    const payUpiBtn = document.getElementById('cartPayUpiBtn');
    if ((payBtn || payUpiBtn) && typeof Razorpay !== 'undefined') {
        const statusBox = document.querySelector('[data-checkout-status]');
        const showStatus = (message, type) => {
            if (!statusBox) return;
            statusBox.textContent = message;
            statusBox.className = `alert alert-${type}`;
        };

        const setButtonsDisabled = (disabled) => {
            if (payBtn) payBtn.disabled = disabled;
            if (payUpiBtn) payUpiBtn.disabled = disabled;
        };

        async function startCartCheckout(useUpiOnly) {
            setButtonsDisabled(true);
            showStatus('Preparing your order...', 'info');
            try {
                const createResponse = await fetch('/api/checkout/create-cart-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                    body: JSON.stringify({ items: TrspCart.getCart(), couponCode: appliedCoupon ? appliedCoupon.code : undefined }),
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
                            TrspCart.clearCart();
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

        if (payBtn) payBtn.addEventListener('click', () => startCartCheckout(false));
        if (payUpiBtn) payUpiBtn.addEventListener('click', () => startCartCheckout(true));
    }

    await loadProducts();
});
