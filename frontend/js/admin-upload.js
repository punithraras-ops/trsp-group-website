document.addEventListener('DOMContentLoaded', () => {
    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    document.querySelectorAll('form[data-ajax-upload]').forEach((form) => {
        const fileInput = form.querySelector('input[type="file"]');
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!fileInput || !submitBtn) return;

        let progressBox = form.querySelector('[data-upload-progress]');
        if (!progressBox) {
            progressBox = document.createElement('div');
            progressBox.setAttribute('data-upload-progress', '');
            progressBox.className = 'w-100 d-none mt-1';
            progressBox.innerHTML = `
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar" role="progressbar" style="width: 0%"></div>
                </div>
                <div class="small text-muted mt-1" data-upload-progress-text></div>
            `;
            form.appendChild(progressBox);
        }
        const bar = progressBox.querySelector('.progress-bar');
        const text = progressBox.querySelector('[data-upload-progress-text]');

        form.addEventListener('submit', (event) => {
            if (!fileInput.files || fileInput.files.length === 0) {
                return;
            }
            event.preventDefault();

            const totalBytes = Array.from(fileInput.files).reduce((sum, f) => sum + f.size, 0);
            const formData = new FormData(form);
            const xhr = new XMLHttpRequest();

            submitBtn.disabled = true;
            fileInput.disabled = true;
            progressBox.classList.remove('d-none');
            bar.style.width = '0%';
            bar.classList.remove('bg-danger');
            text.textContent = `Uploading 0% of ${formatBytes(totalBytes)}...`;

            xhr.upload.addEventListener('progress', (e) => {
                if (!e.lengthComputable) return;
                const pct = Math.round((e.loaded / e.total) * 100);
                bar.style.width = `${pct}%`;
                text.textContent = `Uploading ${pct}% (${formatBytes(e.loaded)} of ${formatBytes(e.total)})...`;
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 400) {
                    bar.style.width = '100%';
                    text.textContent = 'Upload complete. Refreshing...';
                    window.location.reload();
                } else {
                    bar.classList.add('bg-danger');
                    text.textContent = xhr.status === 413
                        ? 'That file is too large.'
                        : `Upload failed (status ${xhr.status}). Please try again.`;
                    submitBtn.disabled = false;
                    fileInput.disabled = false;
                }
            });

            xhr.addEventListener('error', () => {
                bar.classList.add('bg-danger');
                text.textContent = 'Upload failed. Please check your connection and try again.';
                submitBtn.disabled = false;
                fileInput.disabled = false;
            });

            xhr.open('POST', form.action);
            xhr.send(formData);
        });
    });
});
