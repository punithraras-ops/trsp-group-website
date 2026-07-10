<?php

declare(strict_types=1);

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$decodedPath = urldecode($requestPath);
$frontendRoot = dirname(__DIR__) . '/frontend';
$pagesDir = $frontendRoot . '/pages';

if (preg_match('/\.html$/', $decodedPath) === 1) {
    $target = preg_replace('/\.html$/', '', $decodedPath);
    header('Location: ' . ($target === '/index' ? '/' : $target), true, 301);
    exit;
}

$staticFile = realpath($frontendRoot . $decodedPath);
if ($decodedPath !== '/' && $staticFile !== false && str_starts_with($staticFile, $frontendRoot) && is_file($staticFile)) {
    return false;
}

$routeMap = [
    '/' => $pagesDir . '/index.php',
    '/index.php' => $pagesDir . '/index.php',
    '/about' => $pagesDir . '/about.php',
    '/about.php' => $pagesDir . '/about.php',
    '/services' => $pagesDir . '/services.php',
    '/services.php' => $pagesDir . '/services.php',
    '/software-development' => $pagesDir . '/software-development.php',
    '/software-development.php' => $pagesDir . '/software-development.php',
    '/contact' => $pagesDir . '/contact.php',
    '/contact.php' => $pagesDir . '/contact.php',
    '/admin' => $pagesDir . '/admin.php',
    '/admin.php' => $pagesDir . '/admin.php',
];

if (isset($routeMap[$decodedPath])) {
    require $routeMap[$decodedPath];
    return true;
}

http_response_code(404);
require $pagesDir . '/404.php';
return true;
