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
