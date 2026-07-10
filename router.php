<?php

declare(strict_types=1);

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$decodedPath = urldecode($requestPath);
$documentRoot = __DIR__;

if (preg_match('/\.html$/', $decodedPath) === 1) {
    $target = preg_replace('/\.html$/', '', $decodedPath);
    header('Location: ' . ($target === '/index' ? '/' : $target), true, 301);
    exit;
}

$staticFile = realpath($documentRoot . $decodedPath);
if ($decodedPath !== '/' && $staticFile !== false && str_starts_with($staticFile, $documentRoot) && is_file($staticFile)) {
    return false;
}

$routeMap = [
    '/' => __DIR__ . '/index.php',
    '/index.php' => __DIR__ . '/index.php',
    '/about' => __DIR__ . '/about.php',
    '/about.php' => __DIR__ . '/about.php',
    '/services' => __DIR__ . '/services.php',
    '/services.php' => __DIR__ . '/services.php',
    '/software-development' => __DIR__ . '/software-development.php',
    '/software-development.php' => __DIR__ . '/software-development.php',
    '/contact' => __DIR__ . '/contact.php',
    '/contact.php' => __DIR__ . '/contact.php',
];

if (isset($routeMap[$decodedPath])) {
    require $routeMap[$decodedPath];
    return true;
}

http_response_code(404);
require __DIR__ . '/404.php';
return true;
