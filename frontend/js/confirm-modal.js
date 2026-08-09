document.addEventListener('DOMContentLoaded', () => {
    const confirmModalEl = document.getElementById('customConfirmModal');
    if (!confirmModalEl || typeof bootstrap === 'undefined') {
        window.customConfirm = (message) => Promise.resolve(window.confirm(message));
        return;
    }

    const confirmModal = new bootstrap.Modal(confirmModalEl);

    function customConfirm(message) {
        return new Promise((resolve) => {
            document.getElementById('customConfirmMessage').textContent = message;
            const okBtn = document.getElementById('customConfirmOk');
            const cancelBtn = document.getElementById('customConfirmCancel');
            let decided = false;

            const onOk = () => { decided = true; confirmModal.hide(); resolve(true); };
            const onCancel = () => { decided = true; confirmModal.hide(); resolve(false); };
            const onHidden = () => {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                confirmModalEl.removeEventListener('hidden.bs.modal', onHidden);
                if (!decided) resolve(false);
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            confirmModalEl.addEventListener('hidden.bs.modal', onHidden);
            confirmModal.show();
        });
    }

    window.customConfirm = customConfirm;

    document.querySelectorAll('form[data-confirm]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            if (form.dataset.confirmed === '1') {
                return;
            }
            event.preventDefault();
            const ok = await customConfirm(form.dataset.confirm);
            if (ok) {
                form.dataset.confirmed = '1';
                form.requestSubmit ? form.requestSubmit() : form.submit();
            }
        });
    });
});
