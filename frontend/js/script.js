document.addEventListener('DOMContentLoaded', () => {
    if (window.AOS) {
        window.AOS.init({ duration: 1000, once: true });
    }

    const authModalEl = document.getElementById('authModal');
    if (authModalEl && window.bootstrap) {
        const authModal = new window.bootstrap.Modal(authModalEl);

        document.querySelectorAll('[data-open-login]').forEach(trigger => {
            trigger.addEventListener('click', event => {
                event.preventDefault();
                authModal.show();
            });
        });

        if (authModalEl.dataset.autoshow === '1') {
            authModal.show();
        }
    }

    const navbar = document.querySelector('.navbar');

    const updateScrollState = () => {
        const isScrolled = window.scrollY > 100;
        document.body.classList.toggle('scrolled', isScrolled);

        if (navbar) {
            navbar.classList.toggle('scrolled', isScrolled);
        }
    };

    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', event => {
            const targetSelector = anchor.getAttribute('href');

            if (!targetSelector || targetSelector === '#') {
                return;
            }

            const targetElement = document.querySelector(targetSelector);
            if (!targetElement) {
                return;
            }

            event.preventDefault();
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    const contactForm = document.querySelector('[data-contact-form]');
    if (!contactForm) {
        return;
    }

    const statusBox = document.querySelector('[data-form-status]');
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const submitLabel = contactForm.querySelector('[data-submit-label]');
    const serviceField = contactForm.querySelector('[name="service"]');
    const initialService = serviceField ? serviceField.value : '';

    const showStatus = (message, type) => {
        if (!statusBox) {
            return;
        }

        statusBox.textContent = message;
        statusBox.className = `alert alert-${type}`;
    };

    contactForm.addEventListener('submit', async event => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const payload = Object.fromEntries(formData.entries());

        if (submitButton) {
            submitButton.disabled = true;
        }

        if (submitLabel) {
            submitLabel.textContent = 'Sending...';
        }

        showStatus('Sending your message...', 'info');

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken(),
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Unable to send your message.');
            }

            contactForm.reset();

            if (serviceField) {
                serviceField.value = initialService;
            }

            showStatus('Thanks. Your message has been saved successfully.', 'success');
        } catch (error) {
            showStatus(error.message || 'Something went wrong. Please try again.', 'danger');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }

            if (submitLabel) {
                submitLabel.textContent = 'Send Message';
            }
        }
    });
});
