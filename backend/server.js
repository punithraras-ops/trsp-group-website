const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const site = require('./config/site');
const { attachUser } = require('./lib/auth');
const { google, github } = require('./lib/oauth');
const { getDesignSettings, DEFAULT_COLORS, DEFAULT_ADMIN_BG } = require('./lib/design');
const { getMergedSite } = require('./lib/siteInfo');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const frontendDir = path.join(__dirname, '..', 'frontend');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(frontendDir, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(frontendDir, { index: false }));

app.use(attachUser);

app.use(async (req, res, next) => {
    res.locals.currentPath = req.originalUrl;
    res.locals.redirect = req.query.redirect || req.originalUrl;
    res.locals.authError = req.query.authError || '';
    res.locals.autoShowLogin = req.query.openLogin === '1';
    res.locals.dbConfigured = db.isDbConfigured();
    res.locals.oauth = { google: google.isConfigured(), github: github.isConfigured() };
    try {
        res.locals.design = await getDesignSettings();
    } catch (error) {
        res.locals.design = { colors: DEFAULT_COLORS, images: {}, adminBackground: DEFAULT_ADMIN_BG };
    }
    try {
        res.locals.site = await getMergedSite();
    } catch (error) {
        res.locals.site = site;
    }
    next();
});

app.use(require('./routes/pages'));
app.use(require('./routes/auth'));
app.use(require('./routes/contact'));
app.use(require('./routes/checkout'));
app.use(require('./routes/admin'));

app.use((req, res) => {
    res.status(404).render('404', {
        pageTitle: 'Page Not Found',
        pageDescription: 'The requested page could not be found.',
        activePage: '',
    });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Something went wrong.');
});

async function start() {
    await db.connect();

    app.listen(port, host, () => {
        console.log(`Server running at http://${host}:${port}`);
    });
}

start();
