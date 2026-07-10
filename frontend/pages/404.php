<?php

declare(strict_types=1);

$site = require dirname(__DIR__, 2) . '/backend/config/site.php';
$pageTitle = 'Page Not Found';
$pageDescription = 'The requested page could not be found.';
$activePage = '';

include __DIR__ . '/layout-top.php';
?>

<section class="section-padding bg-light page-offset">
    <div class="container text-center">
        <h1 class="display-3 fw-bold mb-4">404</h1>
        <p class="lead mb-4">The page you requested does not exist.</p>
        <a href="<?= e($site['routes']['home']) ?>" class="btn btn-primary btn-lg">Back to Home</a>
    </div>
</section>

<?php include __DIR__ . '/layout-bottom.php'; ?>
