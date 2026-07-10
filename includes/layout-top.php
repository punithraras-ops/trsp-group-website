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
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body data-page="<?= e($activePage) ?>">
    <nav class="navbar navbar-expand-lg navbar-dark fixed-top shadow-sm transition-all">
        <div class="container">
            <a class="navbar-brand fw-bold" href="<?= e($site['routes']['home']) ?>">
                <span class="brand-short"><?= e($site['short_name']) ?></span>
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
