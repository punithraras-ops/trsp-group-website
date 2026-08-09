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
                chatModal.show();
                try {
                    const response = await fetch(`/api/tickets/${currentTicketId}/messages`);
                    const data = await response.json();
                    renderMessages(data.messages);
                } catch (error) {
                    messagesEl.innerHTML = '<p class="text-danger">Unable to load messages.</p>';
                }
                input.focus();
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

                const openBtn = document.querySelector(`[data-open-chat="${currentTicketId}"]`);
                if (openBtn) {
                    const count = messagesEl.querySelectorAll(':scope > div').length;
                    openBtn.innerHTML = `<i class="fas fa-comments me-1"></i>Conversation (${count})`;
                }
            } catch (error) {
                statusEl.textContent = error.message;
                statusEl.className = 'small mt-2 text-danger';
            } finally {
                submitBtn.disabled = false;
            }
        });
    }
});
