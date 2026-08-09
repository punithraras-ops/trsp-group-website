document.addEventListener('DOMContentLoaded', () => {
    const chatModalEl = document.getElementById('ticketChatModal');
    if (!chatModalEl || typeof bootstrap === 'undefined') {
        return;
    }

    const chatModal = new bootstrap.Modal(chatModalEl);
    const titleEl = document.getElementById('ticketChatModalTitle');
    const messagesEl = document.getElementById('ticketChatMessages');
    const form = document.getElementById('ticketChatForm');
    const input = document.getElementById('ticketChatInput');
    const statusEl = document.getElementById('ticketChatStatus');
    let currentTicketId = null;
    let currentUserName = 'Customer';

    function renderMessages(messages) {
        if (!messages || messages.length === 0) {
            messagesEl.innerHTML = '<p class="text-muted">No messages yet.</p>';
            return;
        }
        messagesEl.innerHTML = messages.map((m) => `
            <div class="p-2 rounded-3 ${m.from === 'admin' ? 'bg-primary bg-opacity-10 align-self-end' : 'bg-light align-self-start'}" style="max-width: 80%;">
                <div class="small fw-bold mb-1">${m.from === 'admin' ? 'Our Team' : currentUserName}</div>
                <div>${m.text}</div>
                <div class="small text-muted mt-1">${new Date(m.created_at).toLocaleString('en-IN')}</div>
            </div>
        `).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    document.querySelectorAll('[data-open-chat]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            currentTicketId = btn.dataset.openChat;
            currentUserName = btn.dataset.userName || 'Customer';
            titleEl.textContent = `Conversation - ${btn.dataset.ticketTitle}`;
            statusEl.textContent = '';
            messagesEl.innerHTML = '<p class="text-muted">Loading...</p>';
            chatModal.show();
            try {
                const response = await fetch(`/admin/tickets/${currentTicketId}/messages`);
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
            const response = await fetch(`/admin/tickets/${currentTicketId}/message`, {
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
                <div class="small fw-bold mb-1">Our Team</div>
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
});
