const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'secret-pillow-store',
    resave: false,
    saveUninitialized: true,
}));

app.set('view engine', 'ejs');

const dbConfig = {
    host: 'localhost',
    user: 'youruser',
    password: 'yourpass',
    database: 'pillow_store'
};

// Middleware to init cart
app.use((req, res, next) => {
    if (!req.session.cart) req.session.cart = [];
    next();
});

// GET Home Page
app.get('/', async (req, res) => {
    const db = await mysql.createConnection(dbConfig);
    const [products] = await db.execute('SELECT * FROM products');
    const message = req.session.message;
    req.session.message = null;
    res.render('index', { products, message });
});

// POST Add to cart
app.post('/add-to-cart', (req, res) => {
    const productId = parseInt(req.body.productId);
    req.session.cart.push(productId);
    res.redirect('/');
});

// GET Cart
app.get('/cart', async (req, res) => {
    const db = await mysql.createConnection(dbConfig);
    const ids = req.session.cart;
    if (ids.length === 0) return res.render('cart', { items: [], message: null });

    const placeholders = ids.map(() => '?').join(',');
    const [items] = await db.execute(
        `SELECT * FROM products WHERE id IN (${placeholders})`,
        ids
    );
    const message = req.session.message;
    req.session.message = null;
    res.render('cart', { items, message });
});

// POST Remove from cart
app.post('/remove-from-cart', (req, res) => {
    const productId = parseInt(req.body.productId);
    req.session.cart = req.session.cart.filter(id => id !== productId);
    res.redirect('/cart');
});

// POST Cancel cart
app.post('/cancel', (req, res) => {
    req.session.cart = [];
    req.session.message = 'Purchase canceled.';
    res.redirect('/');
});

// POST Finalize Purchase
app.post('/finalize', async (req, res) => {
    const db = await mysql.createConnection(dbConfig);
    const cart = req.session.cart;

    // Start transaction
    await db.beginTransaction();

    try {
        for (const id of cart) {
            const [rows] = await db.execute('SELECT quantity FROM products WHERE id = ?', [id]);
            if (!rows.length || rows[0].quantity <= 0) {
                throw new Error('One of the items is out of stock.');
            }

            await db.execute('UPDATE products SET quantity = quantity - 1 WHERE id = ?', [id]);
        }

        await db.commit();
        req.session.cart = [];
        req.session.message = 'Purchase successful!';
        res.redirect('/');
    } catch (error) {
        await db.rollback();
        req.session.message = 'Purchase failed: ' + error.message;
        res.redirect('/cart');
    }
});
