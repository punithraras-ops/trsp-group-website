<?php

declare(strict_types=1);

$site = require dirname(__DIR__, 2) . '/backend/config/site.php';
$pageTitle = $site['short_name'] . ' - Custom Software Development';
$pageDescription = 'Custom software development services from ' . $site['legal_name'] . '.';
$activePage = 'services';

include __DIR__ . '/layout-top.php';
?>

<section class="hero text-center text-white d-flex align-items-center">
    <div class="container">
        <div data-aos="fade-up">
            <i class="fas fa-laptop-code fa-5x mb-4 text-white opacity-80"></i>
            <h1 class="display-3 fw-bold">Custom Software Development</h1>
            <p class="lead mb-5">Advanced, research-driven software solutions tailored to your business needs</p>
        </div>
    </div>
</section>

<section class="section-padding bg-light">
    <div class="container">
        <h2 class="text-center fw-bold mb-5" data-aos="fade-up">Key Features &amp; Capabilities</h2>

        <div class="row g-5">
            <?php foreach ($site['software_features'] as $index => $feature): ?>
                <div class="col-lg-6" data-aos="<?= $index % 2 === 0 ? 'fade-right' : 'fade-left' ?>">
                    <div class="feature-item p-4 rounded shadow-sm bg-white mb-4 h-100">
                        <h4 class="text-primary fw-bold"><?= e($feature['title']) ?></h4>
                        <p class="mb-0"><?= e($feature['description']) ?></p>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<section class="section-padding">
    <div class="container">
        <h2 class="text-center fw-bold mb-5" data-aos="fade-up">Our Software Portfolio</h2>
        <p class="text-center lead mb-5">Examples of application experiences that can be adapted for your business goals.</p>

        <div class="row g-4 justify-content-center">
            <?php foreach ($site['software_portfolio'] as $index => $project): ?>
                <div class="col-lg-4 col-md-6" data-aos="zoom-in" data-aos-delay="<?= (string) ($index * 200) ?>">
                    <div class="portfolio-item shadow-lg rounded overflow-hidden h-100">
                        <img src="<?= e($project['image']) ?>" alt="<?= e($project['title']) ?>" class="img-fluid">
                        <div class="p-3 text-center bg-white h-100">
                            <h5><?= e($project['title']) ?></h5>
                            <p class="mb-0"><?= e($project['description']) ?></p>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>

        <div class="text-center mt-5">
            <a href="<?= e($site['routes']['contact']) ?>?service=software-development" class="btn btn-primary btn-lg shadow">Discuss Your Project</a>
        </div>
    </div>
</section>

<?php include __DIR__ . '/layout-bottom.php'; ?>
