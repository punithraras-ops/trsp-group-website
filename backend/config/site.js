module.exports = {
    company_name: 'Technical of RSP Groups',
    legal_name: 'Technical of RSP Groups',
    short_name: 'Technical of RSP Groups',
    site_url: process.env.SITE_URL || 'https://trsp-group-website.onrender.com',
    logo_path: '/img/logo.png',
    icon_path: '/img/navbar-mark.png',
    location: 'Chikkamagaluru, Karnataka',
    address: 'Near Water Tank, Teguru',
    postal_code: '577101',
    gst: '[Your GST Number]',
    email: 'info@trspgroups.com',
    phone_display: '+91 7795183739',
    phone_href: '+917*******39',
    whatsapp_href: 'https://wa.me/917*******39',
    default_description: 'Technical of RSP Groups delivers research-driven software, digital products, and technology solutions from Chikkamagaluru, Karnataka.',

    // Page headings/kickers/descriptions below are all admin-editable via
    // Site Info -> Page Text. These are just the defaults shown until an
    // admin overrides them.
    home_hero_kicker: 'Research-Driven Technology Partner',
    home_hero_title: 'Build smarter software, digital products, and business-ready systems.',
    home_hero_description: 'We help organizations move from concept to launch with modern engineering, better user experience, secure delivery, and practical product strategy.',
    home_services_kicker: 'What We Do',
    home_services_heading: 'Our Services',
    home_services_description: 'Technical of RSP Groups combines engineering, analytics, cybersecurity, and product thinking to deliver dependable solutions that are easy to adopt and ready to scale.',
    home_about_kicker: 'About Us',
    home_about_heading: 'Technology delivery backed by clear research and practical execution.',
    home_research_kicker: 'Research Focus',
    home_research_heading: 'Our Research Verticals',
    home_research_description: 'We explore scalable architecture, product R&D, and analytics capabilities that strengthen software delivery and decision-making.',
    home_testimonials_kicker: 'Client Trust',
    home_testimonials_heading: 'What Clients Say',
    home_testimonials_description: 'We aim to be consistent, collaborative, and dependable across every engagement.',

    services_hero_kicker: 'Our Expertise',
    services_hero_title: 'Services designed to move ideas into reliable products.',
    services_hero_description: 'From engineering delivery to analytics, security, and product scale-up, Technical of RSP Groups helps businesses build with clarity and confidence.',
    services_offer_kicker: 'What We Offer',
    services_offer_heading: 'Our Services',
    services_offer_description: 'Each service is shaped to reduce delivery friction, improve visibility, and give your team a stronger foundation for growth.',
    services_process_kicker: 'How We Work',
    services_process_heading: 'A simple process with strong execution.',
    services_process_description: 'We keep communication clear, delivery structured, and technical decisions aligned with business goals.',

    about_heading: 'Research-led technology support for businesses building what comes next.',
    about_paragraph2: 'Our work combines software engineering, research thinking, security awareness, and delivery discipline so that every engagement stays practical, measurable, and aligned with business goals.',

    contact_heading: 'Contact Us',
    contact_subheading: 'Get in touch with Technical of RSP Groups. We are here to help.',

    routes: {
        home: '/',
        about: '/about',
        services: '/services',
        contact: '/contact',
        'software-development': '/software-development',
    },

    research_verticals: [
        {
            id: 'research1',
            title: 'System Architecture',
            summary: 'Designing scalable, resilient, and AI-native frameworks for complex distributed systems, enabling efficient training and deployment of large-scale AI models.',
            areas: [
                'Scalable Distributed Systems',
                'Cloud-Native & Microservices Architecture',
                'Fault-Tolerant & High-Availability Design',
                'AI-Optimized Infrastructure',
                'Edge Computing Frameworks',
            ],
        },
        {
            id: 'research2',
            title: 'Product R&D',
            summary: 'Rapid prototyping, iterative testing, and AI-accelerated development of high-precision, user-centric products, from concept to market-ready solutions.',
            areas: [
                'AI-Driven Prototyping',
                'User-Centered Product Design',
                'Agile Development Cycles',
                'Precision Engineering & Testing',
                'Market-Ready Innovation',
            ],
        },
        {
            id: 'research3',
            title: 'Data Analytics',
            summary: 'Advanced AI-driven analytics for extracting actionable insights, predicting system behavior, and optimizing performance at scale.',
            areas: [
                'Predictive Modeling',
                'Real-Time Data Processing',
                'Machine Learning Insights',
                'Performance Optimization',
                'Big Data Analytics',
            ],
        },
    ],

    testimonials: [
        { quote: 'Outstanding service and professionalism from Technical of RSP Groups!', author: 'Client Name, Company' },
        { quote: 'Highly recommended for quality and timely delivery.', author: 'Another Client' },
        { quote: 'Excellent partner for all our needs - reliable and innovative.', author: 'Third Client' },
    ],

    software_portfolio: [
        { title: 'E-Commerce Platform', description: 'Full-stack React + Node.js app with payment integration', image: '/img/portfolio-ecommerce.svg' },
        { title: 'Inventory Management System', description: 'Enterprise ERP with real-time tracking', image: '/img/portfolio-inventory.svg' },
        { title: 'AI-Powered Dashboard', description: 'Predictive analytics web app', image: '/img/portfolio-dashboard.svg' },
    ],
};
