<?php

declare(strict_types=1);

$adminUser = getenv('ADMIN_USER') ?: 'admin';
$adminPassword = getenv('ADMIN_PASSWORD') ?: '';

if ($adminPassword === '') {
    http_response_code(500);
    echo 'Admin panel is not configured. Set the ADMIN_PASSWORD environment variable.';
    exit;
}

$providedUser = $_SERVER['PHP_AUTH_USER'] ?? '';
$providedPassword = $_SERVER['PHP_AUTH_PW'] ?? '';

if (!hash_equals($adminUser, $providedUser) || !hash_equals($adminPassword, $providedPassword)) {
    header('WWW-Authenticate: Basic realm="Admin Panel"');
    http_response_code(401);
    echo 'Authentication required.';
    exit;
}

$site = require dirname(__DIR__, 2) . '/backend/config/site.php';
$pageTitle = $site['short_name'] . ' - Admin';
$pageDescription = 'Internal admin panel.';
$activePage = '';

$storageFile = dirname(__DIR__, 2) . '/backend/storage/contact-submissions.json';
$submissions = [];
if (is_file($storageFile)) {
    $submissions = json_decode(file_get_contents($storageFile), true) ?: [];
}
$submissions = array_reverse($submissions);

include __DIR__ . '/layout-top.php';
?>

<section class="section-padding page-offset">
    <div class="container">
        <h1 class="display-5 fw-bold mb-4">Contact Submissions</h1>
        <p class="text-muted mb-4"><?= count($submissions) ?> total submission(s).</p>

        <?php if (empty($submissions)): ?>
            <p>No submissions yet.</p>
        <?php else: ?>
        <div class="table-responsive">
            <table class="table table-striped align-middle bg-white rounded shadow-sm">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Service</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($submissions as $submission): ?>
                        <tr>
                            <td class="text-nowrap"><?= e((string) ($submission['createdAt'] ?? '')) ?></td>
                            <td><?= e((string) ($submission['name'] ?? '')) ?></td>
                            <td><a href="mailto:<?= e((string) ($submission['email'] ?? '')) ?>"><?= e((string) ($submission['email'] ?? '')) ?></a></td>
                            <td><?= e((string) ($submission['phone'] ?? '')) ?></td>
                            <td><?= e((string) ($submission['service'] ?? '')) ?></td>
                            <td><?= nl2br(e((string) ($submission['message'] ?? ''))) ?></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>
</section>

<?php include __DIR__ . '/layout-bottom.php'; ?>
