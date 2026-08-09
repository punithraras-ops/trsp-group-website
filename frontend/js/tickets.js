document.addEventListener('DOMContentLoaded', () => {
    const unreadToast = document.querySelector('[data-ticket-unread-toast]');
    if (unreadToast) {
        setTimeout(() => unreadToast.remove(), 5000);
    }

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

    async function payForTicket(ticketId, buttons, useUpiOnly) {
        if (typeof Razorpay === 'undefined') return;
        const statusBox = document.querySelector(`[data-ticket-pay-status="${ticketId}"]`);
        const showStatus = (message, type) => {
            if (!statusBox) return;
            statusBox.textContent = message;
            statusBox.className = `alert alert-${type} py-2`;
        };
        const setDisabled = (disabled) => buttons.forEach((b) => { b.disabled = disabled; });

        setDisabled(true);
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
                        setDisabled(false);
                    }
                },
                modal: {
                    ondismiss: () => {
                        setDisabled(false);
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
            setDisabled(false);
        }
    }

    document.querySelectorAll('[data-pay-ticket]').forEach((btn) => {
        const ticketId = btn.dataset.payTicket;
        const upiBtn = document.querySelector(`[data-pay-ticket-upi="${ticketId}"]`);
        const buttons = upiBtn ? [btn, upiBtn] : [btn];
        btn.addEventListener('click', () => payForTicket(ticketId, buttons, false));
    });

    document.querySelectorAll('[data-pay-ticket-upi]').forEach((btn) => {
        const ticketId = btn.dataset.payTicketUpi;
        const payBtn = document.querySelector(`[data-pay-ticket="${ticketId}"]`);
        const buttons = payBtn ? [btn, payBtn] : [btn];
        btn.addEventListener('click', () => payForTicket(ticketId, buttons, true));
    });

    document.querySelectorAll('[data-pay-ticket-manual-upi]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const ticketId = btn.dataset.payTicketManualUpi;
            const panel = document.getElementById(`manualUpiPanel-${ticketId}`);
            const statusBox = document.querySelector(`[data-ticket-pay-status="${ticketId}"]`);
            const showStatus = (message, type) => {
                if (!statusBox) return;
                statusBox.textContent = message;
                statusBox.className = `alert alert-${type} py-2`;
            };

            btn.disabled = true;
            showStatus('Generating your UPI QR code...', 'info');

            try {
                const createResponse = await fetch(`/api/tickets/${ticketId}/create-manual-upi-order`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                });
                const order = await createResponse.json();
                if (!createResponse.ok) {
                    throw new Error(order.error || 'Unable to generate UPI QR code.');
                }

                panel.classList.remove('d-none');
                panel.innerHTML = `
                    <img src="${order.qrDataUrl}" alt="UPI QR Code" style="width:220px;height:220px;">
                    <p class="mt-2 mb-1"><strong>Scan with any UPI app</strong></p>
                    <p class="text-muted small mb-1">UPI ID: ${order.upiId}</p>
                    <p class="fw-bold mb-3">Amount: &#8377;${(order.amount / 100).toLocaleString('en-IN')}</p>
                    <div class="input-group mb-2">
                        <input type="text" class="form-control" id="utrInput-${ticketId}" placeholder="Enter UPI transaction / UTR number after paying">
                        <button class="btn btn-primary" id="submitUtrBtn-${ticketId}" type="button">Submit</button>
                    </div>
                    <div class="small" id="utrStatus-${ticketId}"></div>
                `;
                showStatus('', 'info');

                document.getElementById(`submitUtrBtn-${ticketId}`).addEventListener('click', async () => {
                    const utrInput = document.getElementById(`utrInput-${ticketId}`);
                    const utrStatus = document.getElementById(`utrStatus-${ticketId}`);
                    const utr = utrInput.value.trim();
                    if (!utr) {
                        utrStatus.textContent = 'Please enter your transaction reference number.';
                        utrStatus.className = 'small text-danger';
                        return;
                    }
                    utrStatus.textContent = 'Submitting...';
                    utrStatus.className = 'small text-muted';
                    try {
                        const submitResponse = await fetch(`/api/tickets/${ticketId}/submit-utr`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                            body: JSON.stringify({ utr }),
                        });
                        const result = await submitResponse.json();
                        if (!submitResponse.ok) {
                            throw new Error(result.error || 'Unable to submit reference.');
                        }
                        utrStatus.textContent = "Reference submitted! We'll confirm your payment shortly.";
                        utrStatus.className = 'small text-success';
                        utrInput.disabled = true;
                        document.getElementById(`submitUtrBtn-${ticketId}`).disabled = true;
                        setTimeout(() => window.location.reload(), 1500);
                    } catch (error) {
                        utrStatus.textContent = error.message;
                        utrStatus.className = 'small text-danger';
                    }
                });
            } catch (error) {
                showStatus(error.message, 'danger');
            } finally {
                btn.disabled = false;
            }
        });
    });

    const chatModalEl = document.getElementById('ticketChatModal');
    if (chatModalEl && typeof bootstrap !== 'undefined') {
        const chatModal = new bootstrap.Modal(chatModalEl);
        const titleEl = document.getElementById('ticketChatModalTitle');
        const messagesEl = document.getElementById('ticketChatMessages');
        const form = document.getElementById('ticketChatForm');
        const input = document.getElementById('ticketChatInput');
        const statusEl = document.getElementById('ticketChatStatus');
        let currentTicketId = null;

        function renderMessages(messages) {
            if (!messages || messages.length === 0) {
                messagesEl.innerHTML = '<p class="text-muted">No messages yet.</p>';
                return;
            }
            messagesEl.innerHTML = messages.map((m) => `
                <div class="p-2 rounded-3 ${m.from === 'admin' ? 'bg-light align-self-start' : 'bg-primary bg-opacity-10 align-self-end'}" style="max-width: 80%;">
                    <div class="small fw-bold mb-1">${m.from === 'admin' ? 'Our Team' : 'You'}</div>
                    <div>${m.text}</div>
                    <div class="small text-muted mt-1">${new Date(m.created_at).toLocaleString('en-IN')}</div>
                </div>
            `).join('');
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        document.querySelectorAll('[data-open-chat]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                currentTicketId = btn.dataset.openChat;
                titleEl.textContent = `Conversation - ${btn.dataset.ticketTitle}`;
                statusEl.textContent = '';
                messagesEl.innerHTML = '<p class="text-muted">Loading...</p>';

                const isClosed = btn.dataset.ticketStatus === 'closed';
                const submitBtn = form.querySelector('button[type="submit"]');
                input.disabled = isClosed;
                submitBtn.disabled = isClosed;
                input.placeholder = isClosed ? 'This ticket is closed - messaging is disabled.' : 'Type a message...';

                chatModal.show();
                try {
                    const response = await fetch(`/api/tickets/${currentTicketId}/messages`);
                    const data = await response.json();
                    renderMessages(data.messages);
                } catch (error) {
                    messagesEl.innerHTML = '<p class="text-danger">Unable to load messages.</p>';
                }
                if (!isClosed) input.focus();
            });
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const text = input.value.trim();
            if (!text || !currentTicketId) return;

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            statusEl.textContent = '';

            try {
                const response = await fetch(`/api/tickets/${currentTicketId}/message`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
                    body: JSON.stringify({ text }),
                });
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Unable to send message.');
                }
                if (messagesEl.querySelector('.text-muted')) {
                    messagesEl.innerHTML = '';
                }
                const div = document.createElement('div');
                div.className = 'p-2 rounded-3 bg-primary bg-opacity-10 align-self-end';
                div.style.maxWidth = '80%';
                div.innerHTML = `
                    <div class="small fw-bold mb-1">You</div>
                    <div>${result.message.text}</div>
                    <div class="small text-muted mt-1">${new Date(result.message.created_at).toLocaleString('en-IN')}</div>
                `;
                messagesEl.appendChild(div);
                messagesEl.scrollTop = messagesEl.scrollHeight;
                input.value = '';
            } catch (error) {
                statusEl.textContent = error.message;
                statusEl.className = 'small mt-2 text-danger';
            } finally {
                submitBtn.disabled = false;
            }
        });
    }
});
