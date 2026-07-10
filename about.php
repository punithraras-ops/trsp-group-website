<?php

declare(strict_types=1);

$site = require __DIR__ . '/includes/site.php';
$pageTitle = $site['short_name'] . ' - About Us';
$pageDescription = 'About ' . $site['legal_name'] . ' in ' . $site['location'] . '.';
$activePage = 'about';

include __DIR__ . '/includes/layout-top.php';
?>

<section class="section-padding section-soft page-offset">
    <div class="container">
        <div class="row align-items-center g-5">
            <div class="col-lg-6" data-aos="fade-right">
                <span class="section-eyebrow">About <?= e($site['short_name']) ?></span>
                <h1 class="display-4 fw-bold mb-4">Research-led technology support for businesses building what comes next.</h1>
                <p class="lead"><?= e($site['short_name']) ?> is a technology-focused organization based in <strong><?= e($site['location']) ?></strong>. We help teams plan, build, and improve digital systems with dependable execution and a strong product mindset.</p>
                <p>Our work combines software engineering, research thinking, security awareness, and delivery discipline so that every engagement stays practical, measurable, and aligned with business goals.</p>

                <div class="about-mini-grid">
                    <div class="about-mini-card">
                        <h3>Mission</h3>
                        <p>Deliver digital solutions that create long-term value through quality, trust, and clear communication.</p>
                    </div>
                    <div class="about-mini-card">
                        <h3>Vision</h3>
                        <p>Become a trusted technology partner for organizations across Karnataka and beyond.</p>
                    </div>
                    <div class="about-mini-card">
                        <h3>Team</h3>
                        <p>Support clients with focused engineering, collaborative execution, and dependable follow-through.</p>
                    </div>
                    <div class="about-mini-card">
                        <h3>Focus</h3>
                        <p>Turn ideas into usable systems that are secure, maintainable, and ready to scale.</p>
                    </div>
                </div>
            </div>

            <div class="col-lg-6" data-aos="fade-left">
                <div class="about-visual-shell">
                    <img src="/img/placeholder-team.svg" alt="Technical of RSP Groups Team" class="img-fluid rounded shadow-lg">
                </div>
            </div>
        </div>
    </div>
</section>

<?php include __DIR__ . '/includes/layout-bottom.php'; ?>
