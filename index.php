<?php

declare(strict_types=1);

$site = require __DIR__ . '/includes/site.php';
$pageTitle = $site['company_name'];
$pageDescription = $site['default_description'];
$activePage = 'home';

include __DIR__ . '/includes/layout-top.php';
?>

<section class="hero hero-home text-center text-white d-flex align-items-center">
    <div class="container position-relative">
        <div class="row justify-content-center">
            <div class="col-xl-9" data-aos="fade-up">
                <span class="hero-kicker">Research-Driven Technology Partner</span>
                <h1 class="hero-title display-2 fw-bold mb-4">Build smarter software, digital products, and business-ready systems.</h1>
                <p class="hero-description lead mb-5">We help organizations move from concept to launch with modern engineering, better user experience, secure delivery, and practical product strategy.</p>

                <div class="hero-actions d-flex flex-column flex-sm-row justify-content-center gap-3 mb-5">
                    <a href="<?= e($site['routes']['contact']) ?>" class="btn btn-primary btn-lg shadow">Get Quote</a>
                    <a href="tel:<?= e($site['phone_href']) ?>" class="btn btn-outline-light btn-lg shadow">Call Now</a>
                </div>

                <div class="hero-pillbar d-flex flex-wrap justify-content-center gap-3">
                    <?php foreach ($site['services'] as $service): ?>
                        <span class="hero-pill"><?= e($service['title']) ?></span>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</section>

<section class="section-padding bg-light" id="services">
    <div class="container">
        <div class="section-heading text-center mx-auto" data-aos="fade-up">
            <span class="section-eyebrow">What We Do</span>
            <h2 class="display-4 fw-bold mb-3">Our Services</h2>
            <p class="section-description">TRSP Groups combines engineering, analytics, cybersecurity, and product thinking to deliver dependable solutions that are easy to adopt and ready to scale.</p>
        </div>

        <div class="row g-4 justify-content-center">
            <?php foreach ($site['services'] as $index => $service): ?>
                <div class="col-xl-3 col-lg-6 col-md-6" data-aos="zoom-in" data-aos-delay="<?= (string) ($index * 100) ?>">
                    <article class="card service-card h-100 border-0 shadow-lg">
                        <div class="card-body d-flex flex-column">
                            <div class="service-card-header">
                                <span class="service-icon-wrap">
                                    <i class="<?= e($service['icon']) ?>" aria-hidden="true"></i>
                                </span>
                            </div>

                            <div class="service-card-content mb-4">
                                <h3 class="service-card-title"><?= e($service['title']) ?></h3>
                                <p class="card-text text-muted mb-0"><?= e($service['summary']) ?></p>
                            </div>

                            <a href="<?= e($service['href']) ?>" class="btn btn-primary service-card-button mt-auto">
                                <?= e($service['cta_label']) ?> <i class="fas fa-arrow-right ms-2" aria-hidden="true"></i>
                            </a>
                        </div>
                    </article>
                </div>
            <?php endforeach; ?>
        </div>

        <div class="text-center mt-5">
            <a href="<?= e($site['routes']['services']) ?>" class="btn btn-primary btn-lg shadow">View All Services</a>
        </div>
    </div>
</section>

<section class="section-padding section-soft">
    <div class="container">
        <div class="row align-items-center g-5">
            <div class="col-lg-6" data-aos="fade-right">
                <span class="section-eyebrow">About Us</span>
                <h2 class="display-5 fw-bold mb-4">Technology delivery backed by clear research and practical execution.</h2>
                <p class="lead"><?= e($site['short_name']) ?> is a technology-focused organization based in <?= e($site['location']) ?>, helping teams modernize operations and launch better digital experiences.</p>
                <p>We focus on strong fundamentals: clean architecture, secure implementation, measurable outcomes, and collaboration that keeps projects moving forward.</p>

                <div class="about-mini-grid">
                    <div class="about-mini-card">
                        <h3>Mission</h3>
                        <p>Deliver dependable software solutions with clarity, trust, and long-term value.</p>
                    </div>
                    <div class="about-mini-card">
                        <h3>Approach</h3>
                        <p>Combine research, product thinking, and engineering discipline to solve real business problems.</p>
                    </div>
                </div>

                <a href="<?= e($site['routes']['about']) ?>" class="btn btn-primary shadow mt-4">Learn More <i class="fas fa-arrow-right ms-2"></i></a>
            </div>

            <div class="col-lg-6" data-aos="fade-left">
                <div class="about-visual-shell">
                    <img src="/img/placeholder-team.svg" alt="TRSP Groups Team" class="img-fluid rounded shadow-lg">
                </div>
            </div>
        </div>
    </div>
</section>

<section class="section-padding bg-light" id="research-verticals">
    <div class="container">
        <div class="section-heading text-center mx-auto" data-aos="fade-up">
            <span class="section-eyebrow">Research Focus</span>
            <h2 class="display-5 fw-bold mb-3">Our Research Verticals</h2>
            <p class="section-description">We explore scalable architecture, product R&amp;D, and analytics capabilities that strengthen software delivery and decision-making.</p>
        </div>

        <div class="row g-4 justify-content-center">
            <?php foreach ($site['research_verticals'] as $vertical): ?>
                <div class="col-lg-4 col-md-6">
                    <div class="card research-card h-100 shadow-lg border-0 rounded-4">
                        <div class="card-body p-4">
                            <h4 class="card-title fw-bold text-primary mb-3"><?= e($vertical['title']) ?></h4>
                            <p class="card-text text-muted"><?= e($vertical['summary']) ?></p>

                            <button class="btn btn-link text-primary p-0 mt-3 fw-medium collapse-btn collapsed" data-bs-toggle="collapse" data-bs-target="#<?= e($vertical['id']) ?>" aria-expanded="false" aria-controls="<?= e($vertical['id']) ?>">
                                View Research Areas <i class="fas fa-chevron-down ms-2"></i>
                            </button>

                            <div class="collapse mt-4" id="<?= e($vertical['id']) ?>">
                                <ul class="list-unstyled mb-0">
                                    <?php foreach ($vertical['areas'] as $area): ?>
                                        <li class="mb-2"><?= e($area) ?></li>
                                    <?php endforeach; ?>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<section class="section-padding testimonial-section text-white py-5">
    <div class="container">
        <div class="section-heading text-center mx-auto" data-aos="fade-up">
            <span class="section-eyebrow section-eyebrow-light">Client Trust</span>
            <h2 class="display-5 fw-bold mb-3 text-white">What Clients Say</h2>
            <p class="section-description text-white-50">We aim to be consistent, collaborative, and dependable across every engagement.</p>
        </div>

        <div id="testimonialCarousel" class="carousel slide testimonial-carousel" data-bs-ride="carousel">
            <div class="carousel-inner">
                <?php foreach ($site['testimonials'] as $index => $testimonial): ?>
                    <div class="carousel-item <?= $index === 0 ? 'active' : '' ?>">
                        <div class="testimonial-card text-center mx-auto">
                            <p class="lead fs-4 mb-4">"<?= e($testimonial['quote']) ?>"</p>
                            <h5 class="text-white mb-0">- <?= e($testimonial['author']) ?></h5>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
            <button class="carousel-control-prev" type="button" data-bs-target="#testimonialCarousel" data-bs-slide="prev">
                <span class="carousel-control-prev-icon"></span>
            </button>
            <button class="carousel-control-next" type="button" data-bs-target="#testimonialCarousel" data-bs-slide="next">
                <span class="carousel-control-next-icon"></span>
            </button>
        </div>
    </div>
</section>

<?php include __DIR__ . '/includes/layout-bottom.php'; ?>
