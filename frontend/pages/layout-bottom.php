<?php

declare(strict_types=1);

$site = $site ?? require dirname(__DIR__, 2) . '/backend/config/site.php';
?>
    </main>

    <footer class="footer py-5">
        <div class="container text-center text-md-start">
            <div class="row">
                <div class="col-md-6 mb-4">
                    <h5 class="fw-bold"><?= e($site['legal_name']) ?></h5>
                    <p><?= e($site['address']) ?><br><?= e($site['location']) ?> - <?= e($site['postal_code']) ?><br>GST: <?= e($site['gst']) ?></p>
                </div>
                <div class="col-md-6 mb-4">
                    <h5 class="fw-bold">Contact Us</h5>
                    <p>Email: <a href="mailto:<?= e($site['email']) ?>"><?= e($site['email']) ?></a><br>Phone: <a href="tel:<?= e($site['phone_href']) ?>"><?= e($site['phone_display']) ?></a></p>
                </div>
            </div>
            <hr class="my-4">
            <p class="text-center mb-0">&copy; <?= date('Y') ?> <?= e($site['legal_name']) ?>. All Rights Reserved.</p>
        </div>
    </footer>

    <a href="<?= e($site['whatsapp_href']) ?>" class="whatsapp-btn shadow-lg" target="_blank" rel="noreferrer">
        <i class="fab fa-whatsapp fa-2x"></i>
    </a>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
    <script src="/js/script.js"></script>
</body>
</html>
