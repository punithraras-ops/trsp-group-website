<?php

declare(strict_types=1);

$site = $site ?? require __DIR__ . '/site.php';
$pageTitle = $pageTitle ?? $site['company_name'];
$pageDescription = $pageDescription ?? $site['default_description'];
$activePage = $activePage ?? '';

if (!function_exists('e')) {
    function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="<?= e($pageDescription) ?>">
    <title><?= e($pageTitle) ?></title>
    <link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/img/favicon.png">
    <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
    <link rel="canonical" href="<?= e($site['site_url'] . $_SERVER['REQUEST_URI']) ?>">

    <meta property="og:type" content="website">
    <meta property="og:site_name" content="<?= e($site['legal_name']) ?>">
    <meta property="og:title" content="<?= e($pageTitle) ?>">
    <meta property="og:description" content="<?= e($pageDescription) ?>">
    <meta property="og:image" content="<?= e($site['site_url'] . $site['logo_path']) ?>">
    <meta property="og:url" content="<?= e($site['site_url'] . $_SERVER['REQUEST_URI']) ?>">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?= e($pageTitle) ?>">
    <meta name="twitter:description" content="<?= e($pageDescription) ?>">
    <meta name="twitter:image" content="<?= e($site['site_url'] . $site['logo_path']) ?>">

    <script type="application/ld+json">
    <?= json_encode([
        '@context' => 'https://schema.org',
        '@type' => 'Organization',
        'name' => $site['legal_name'],
        'url' => $site['site_url'],
        'logo' => $site['site_url'] . $site['logo_path'],
        'email' => $site['email'],
        'address' => [
            '@type' => 'PostalAddress',
            'addressLocality' => $site['location'],
            'postalCode' => $site['postal_code'],
            'addressCountry' => 'IN',
        ],
    ], JSON_UNESCAPED_SLASHES) ?>
    </script>

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body data-page="<?= e($activePage) ?>">
    <nav class="navbar navbar-expand-lg navbar-dark fixed-top shadow-sm transition-all">
        <div class="container">
            <a class="navbar-brand fw-bold d-flex align-items-center gap-2" href="<?= e($site['routes']['home']) ?>">
                <img src="<?= e($site['icon_path']) ?>" alt="<?= e($site['legal_name']) ?> logo" class="navbar-logo-mark">
                <span class="brand-full"><?= e($site['legal_name']) ?></span>
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item"><a class="nav-link <?= $activePage === 'home' ? 'active' : '' ?>" href="<?= e($site['routes']['home']) ?>">Home</a></li>
                    <li class="nav-item"><a class="nav-link <?= $activePage === 'services' ? 'active' : '' ?>" href="<?= e($site['routes']['services']) ?>">Services</a></li>
                    <li class="nav-item"><a class="nav-link <?= $activePage === 'contact' ? 'active' : '' ?>" href="<?= e($site['routes']['contact']) ?>">Contact</a></li>
                    <li class="nav-item"><a class="nav-link <?= $activePage === 'about' ? 'active' : '' ?>" href="<?= e($site['routes']['about']) ?>">About</a></li>
                </ul>
            </div>
        </div>
    </nav>
    <main>
