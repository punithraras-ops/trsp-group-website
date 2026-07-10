<?php

declare(strict_types=1);

return [
    'company_name' => 'Technical of RSP Groups',
    'legal_name' => 'Technical of RSP Groups',
    'short_name' => 'Technical of RSP Groups',
    'location' => 'Chikkamagaluru, Karnataka',
    'address' => '[Your Full Address]',
    'postal_code' => '577101',
    'gst' => '[Your GST Number]',
    'email' => 'info@trspgroups.com',
    'phone_display' => '+91 XXXXXXXXXX',
    'phone_href' => '+91XXXXXXXXXX',
    'whatsapp_href' => 'https://wa.me/91XXXXXXXXXX',
    'default_description' => 'Technical of RSP Groups delivers research-driven software, digital products, and technology solutions from Chikkamagaluru, Karnataka.',
    'routes' => [
        'home' => '/',
        'about' => '/about',
        'services' => '/services',
        'contact' => '/contact',
        'software-development' => '/software-development',
    ],
    'services' => [
        [
            'key' => 'software-development',
            'title' => 'Custom Software Development',
            'icon' => 'fas fa-laptop-code',
            'summary' => 'Web, mobile, and business software built around your workflows with modern architecture, clean UX, and scalable delivery.',
            'cta_label' => 'View Detailed Features',
            'href' => '/software-development',
        ],
        [
            'key' => 'business-analytics',
            'title' => 'Business Analytics',
            'icon' => 'fas fa-chart-line',
            'summary' => 'Dashboards, reports, and decision-support systems that turn operational data into clear business insight.',
            'cta_label' => 'Request Details',
            'href' => '/contact?service=business-analytics',
        ],
        [
            'key' => 'cybersecurity',
            'title' => 'Cybersecurity',
            'icon' => 'fas fa-shield-halved',
            'summary' => 'Application hardening, access control, and secure delivery practices that help protect systems and data.',
            'cta_label' => 'Request Details',
            'href' => '/contact?service=cybersecurity',
        ],
        [
            'key' => 'product-strategy',
            'title' => 'Product Strategy & Scale',
            'icon' => 'fas fa-rocket',
            'summary' => 'Roadmaps, rollout planning, and platform improvements that help products launch faster and grow with confidence.',
            'cta_label' => 'Request Details',
            'href' => '/contact?service=product-strategy',
        ],
    ],
    'research_verticals' => [
        [
            'id' => 'research1',
            'title' => 'System Architecture',
            'summary' => 'Designing scalable, resilient, and AI-native frameworks for complex distributed systems, enabling efficient training and deployment of large-scale AI models.',
            'areas' => [
                'Scalable Distributed Systems',
                'Cloud-Native & Microservices Architecture',
                'Fault-Tolerant & High-Availability Design',
                'AI-Optimized Infrastructure',
                'Edge Computing Frameworks',
            ],
        ],
        [
            'id' => 'research2',
            'title' => 'Product R&D',
            'summary' => 'Rapid prototyping, iterative testing, and AI-accelerated development of high-precision, user-centric products, from concept to market-ready solutions.',
            'areas' => [
                'AI-Driven Prototyping',
                'User-Centered Product Design',
                'Agile Development Cycles',
                'Precision Engineering & Testing',
                'Market-Ready Innovation',
            ],
        ],
        [
            'id' => 'research3',
            'title' => 'Data Analytics',
            'summary' => 'Advanced AI-driven analytics for extracting actionable insights, predicting system behavior, and optimizing performance at scale.',
            'areas' => [
                'Predictive Modeling',
                'Real-Time Data Processing',
                'Machine Learning Insights',
                'Performance Optimization',
                'Big Data Analytics',
            ],
        ],
    ],
    'testimonials' => [
        [
            'quote' => 'Outstanding service and professionalism from Technical of RSP Groups!',
            'author' => 'Client Name, Company',
        ],
        [
            'quote' => 'Highly recommended for quality and timely delivery.',
            'author' => 'Another Client',
        ],
        [
            'quote' => 'Excellent partner for all our needs - reliable and innovative.',
            'author' => 'Third Client',
        ],
    ],
    'software_features' => [
        [
            'title' => 'Custom Web Applications',
            'description' => 'Built with modern frameworks for responsive, high-performance web experiences tailored to your workflows.',
        ],
        [
            'title' => 'Mobile App Development',
            'description' => 'Native or cross-platform mobile apps designed for seamless multi-device support and maintainability.',
        ],
        [
            'title' => 'Enterprise Software',
            'description' => 'ERP, CRM, and inventory systems designed for scalability, visibility, and operational efficiency.',
        ],
        [
            'title' => 'AI & Machine Learning Integration',
            'description' => 'Chatbots, predictive analytics, automation, and model-powered workflows integrated into production systems.',
        ],
        [
            'title' => 'Cloud-Based Solutions',
            'description' => 'Secure deployments on AWS, Azure, or Google Cloud with auto-scaling and high availability.',
        ],
        [
            'title' => 'API Development & Integrations',
            'description' => 'RESTful APIs and third-party integrations for payments, messaging, analytics, and internal systems.',
        ],
        [
            'title' => 'Secure Full-Stack Development',
            'description' => 'End-to-end security with authentication, authorization, encryption, and sound development practices.',
        ],
        [
            'title' => 'UI/UX Design & Prototyping',
            'description' => 'User-centered interfaces backed by wireframes, prototypes, and iterative feedback.',
        ],
    ],
    'software_portfolio' => [
        [
            'title' => 'E-Commerce Platform',
            'description' => 'Full-stack React + Node.js app with payment integration',
            'image' => '/img/portfolio-ecommerce.svg',
        ],
        [
            'title' => 'Inventory Management System',
            'description' => 'Enterprise ERP with real-time tracking',
            'image' => '/img/portfolio-inventory.svg',
        ],
        [
            'title' => 'AI-Powered Dashboard',
            'description' => 'Predictive analytics web app',
            'image' => '/img/portfolio-dashboard.svg',
        ],
    ],
];
