/* =========================================================
   HomeWash – shared script
   Works on both pages: it only runs the parts whose
   elements exist on the current page.

   Orders are saved to Firestore (see firebase-init.js) so
   tracking works from any device/browser. If Firebase isn't
   configured yet, everything still works using this
   browser's localStorage as a fallback.
   ========================================================= */

import { db, firebaseConfigured } from "./firebase-init.js";
import {
    doc,
    setDoc,
    getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const RUPEE = '\u20B9';
const DOT = ' \u00B7 ';

/* ---------------------------------------------------------
   Orders
   - Sample orders (HW1042, HW1001) always live locally, so the
     demo works even before Firebase is configured.
   - Real bookings are saved to Firestore (collection "orders",
     doc ID = the HW#### order id) and cached locally so this
     session can show them instantly.
   --------------------------------------------------------- */

const STAGES = [
    { title: 'Order placed', detail: 'We received your order' },
    { title: 'Picked up', detail: 'Rider collected your laundry' },
    { title: 'Washing', detail: 'Your clothes are being washed' },
    { title: 'Drying', detail: 'Drying and folding' },
    { title: 'Out for delivery', detail: 'Rider is on the way' },
    { title: 'Delivered', detail: 'Handed over at your door' },
];

// Sample orders so you can test tracking.
const ORDERS = {
    HW1042: {
        current: 2,
        eta: 'Today, by 6:00 PM',
        times: ['Today, 9:10 AM', 'Today, 10:30 AM', 'Started 11:45 AM'],
        summary: '8 items' + DOT + RUPEE + '260',
    },
    HW1001: {
        current: 5,
        eta: 'Delivered',
        times: ['Yesterday, 8:05 AM', 'Yesterday, 9:20 AM', 'Yesterday, 11:00 AM', 'Yesterday, 2:15 PM', 'Yesterday, 4:50 PM', 'Yesterday, 5:42 PM'],
        summary: '5 items' + DOT + RUPEE + '175',
    },
};

const STORE_KEY = 'homewash-orders';

function loadSavedOrders() {
    try {
        Object.assign(ORDERS, JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
    } catch (err) { /* storage unavailable */ }
}

function cacheOrderLocally(id, order) {
    ORDERS[id] = order;
    try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
        saved[id] = order;
        localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch (err) { /* storage unavailable */ }
}

// Saves a new order: always cached in this browser, and in
// Firestore too when Firebase is configured (so it can be
// tracked from any device).
async function saveOrder(id, order) {
    cacheOrderLocally(id, order);
    if (!firebaseConfigured) return;
    try {
        await setDoc(doc(db, 'orders', id), order);
    } catch (err) {
        console.error('HomeWash: could not save order to Firestore', err);
    }
}

// Looks an order up: checks this browser's cache first (covers
// the sample orders and anything booked this session), then
// falls back to Firestore so orders booked elsewhere can be
// tracked too.
async function findOrder(id) {
    if (ORDERS[id]) return ORDERS[id];
    if (!firebaseConfigured) return null;
    try {
        const snap = await getDoc(doc(db, 'orders', id));
        if (snap.exists()) {
            const order = snap.data();
            ORDERS[id] = order; // cache for this session
            return order;
        }
    } catch (err) {
        console.error('HomeWash: could not look up order in Firestore', err);
    }
    return null;
}

function nextOrderId() {
    let n = 1043;
    while (ORDERS['HW' + n]) n++;
    return 'HW' + n;
}

loadSavedOrders();


/* ---------------------------------------------------------
   Pop-up helpers
   --------------------------------------------------------- */

const bookDialog = $('bookDialog');
const trackDialog = $('trackDialog');
const trackBody = $('trackBody');

[bookDialog, trackDialog].forEach((dlg) => {
    if (!dlg) return;
    // click on the dark backdrop closes the pop-up
    dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
    });
});

if ($('bookClose')) $('bookClose').addEventListener('click', () => bookDialog.close());
if ($('trackClose')) $('trackClose').addEventListener('click', () => trackDialog.close());


/* ---------------------------------------------------------
   Order status card (shown inside the tracking pop-up)
   --------------------------------------------------------- */

function buildOrderCard(id, order) {
    const delivered = order.current === STAGES.length - 1;
    const card = el('div', 'track-card');

    const top = el('div', 'track-top');
    const info = el('div');
    info.append(el('span', 'track-label', 'Order'), el('h3', '', id));
    info.append(
        el('span', 'track-label', delivered ? 'Status' : (order.etaLabel || 'Estimated delivery')),
        el('span', 'track-eta', order.eta)
    );
    if (order.summary) info.append(el('span', 'track-meta', order.summary));

    top.append(info, el('span', 'status-badge' + (delivered ? ' delivered' : ''), STAGES[order.current].title));

    const list = el('ol', 'timeline');
    STAGES.forEach((stage, idx) => {
        const state = idx < order.current || (delivered && idx === order.current)
            ? 'done'
            : idx === order.current ? 'current' : 'pending';
        const li = el('li', state);
        li.append(el('span', 'dot', state === 'done' ? '\u2713' : ''));
        li.append(el('h4', '', stage.title));
        if (state !== 'pending') li.append(el('p', '', order.times[idx] || stage.detail));
        list.append(li);
    });

    card.append(top, list);
    return card;
}

function showOrder(id, order, withBack) {
    const parts = [buildOrderCard(id, order)];
    if (withBack) {
        const back = el('button', 'secondary-btn track-back', 'Track another order');
        back.type = 'button';
        back.addEventListener('click', () => openTrackLookup());
        parts.push(back);
    }
    trackBody.replaceChildren(...parts);
    if (!trackDialog.open) trackDialog.showModal();
}

function showTrackLoading() {
    trackBody.replaceChildren(el('p', 'track-msg', 'Looking up your order…'));
    if (!trackDialog.open) trackDialog.showModal();
}

// Pop-up with an order ID box (used by the "Track Order" link on the booking page)
function openTrackLookup() {
    const form = el('form', 'lookup-form');
    form.noValidate = true;

    const label = el('label', '', 'Order ID');
    label.htmlFor = 'lookupId';

    const input = el('input');
    input.id = 'lookupId';
    input.type = 'text';
    input.placeholder = 'e.g. HW1042';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'characters');

    const msg = el('p', 'track-msg', 'Want to try it? Use the sample order IDs HW1042 or HW1001.');

    const btn = el('button', 'confirm-btn', 'Track order');
    btn.type = 'submit';

    form.append(label, input, msg, btn);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = input.value.trim().toUpperCase();
        msg.classList.remove('error');
        if (!id) {
            msg.textContent = 'Enter your order ID to track it.';
            msg.classList.add('error');
            return;
        }
        btn.disabled = true;
        const order = await findOrder(id);
        btn.disabled = false;
        if (!order) {
            msg.textContent = 'We could not find order ' + id + '. Check the ID and try again.';
            msg.classList.add('error');
            return;
        }
        showOrder(id, order, true);
    });

    trackBody.replaceChildren(form);
    if (!trackDialog.open) trackDialog.showModal();
    input.focus();
}


/* ---------------------------------------------------------
   Booking page: clothes + laundry bag
   --------------------------------------------------------- */

const cartItems = $('cartItems');
const checkoutBtn = document.querySelector('.checkout-btn');
const DELIVERY_FEE = 20;
const cart = {};                      // { "T-Shirt": { price: 20, qty: 2 } }
const emptyCartMarkup = cartItems ? cartItems.innerHTML : '';

function cartCount() {
    return Object.values(cart).reduce((sum, it) => sum + it.qty, 0);
}

function cartSubtotal() {
    return Object.values(cart).reduce((sum, it) => sum + it.qty * it.price, 0);
}

// Called by the "+ Add" buttons in the HTML
function addClothes(name, price) {
    if (!cart[name]) cart[name] = { price: price, qty: 0 };
    cart[name].qty += 1;
    renderCart();
}

function changeQty(name, delta) {
    if (!cart[name]) return;
    cart[name].qty += delta;
    if (cart[name].qty <= 0) delete cart[name];
    renderCart();
}

function renderCart() {
    if (!cartItems) return;

    const names = Object.keys(cart);

    if (!names.length) {
        cartItems.innerHTML = emptyCartMarkup;
    } else {
        const rows = names.map((name) => {
            const item = cart[name];
            const row = el('div', 'cart-item');

            const info = el('div', 'cart-item-info');
            info.append(el('h4', '', name), el('p', '', RUPEE + item.price + ' / piece'));

            const controls = el('div', 'cart-item-controls');
            const minus = el('button', '', '\u2212');
            minus.type = 'button';
            minus.dataset.action = 'dec';
            minus.dataset.name = name;
            minus.setAttribute('aria-label', 'Remove one ' + name);

            const qty = el('span', '', String(item.qty));

            const plus = el('button', '', '+');
            plus.type = 'button';
            plus.dataset.action = 'inc';
            plus.dataset.name = name;
            plus.setAttribute('aria-label', 'Add one ' + name);

            controls.append(minus, qty, plus);

            row.append(info, controls, el('div', 'cart-item-price', RUPEE + item.price * item.qty));
            return row;
        });
        cartItems.replaceChildren(...rows);
    }

    const count = cartCount();
    const subtotal = cartSubtotal();

    $('cartCount').textContent = count;
    $('cartTotal').textContent = RUPEE + subtotal;
    $('finalTotal').textContent = RUPEE + (subtotal + DELIVERY_FEE);

    if (checkoutBtn) checkoutBtn.disabled = count === 0;
}

if (cartItems) {
    cartItems.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        changeQty(btn.dataset.name, btn.dataset.action === 'inc' ? 1 : -1);
    });
    renderCart();

    // Navbar links that had no page yet
    document.querySelectorAll('.nav-links a').forEach((a) => {
        const text = a.textContent.trim();
        if (text === 'Track Order') {
            a.addEventListener('click', (e) => { e.preventDefault(); openTrackLookup(); });
        } else if (text === 'Services') {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelector('.clothes-section').scrollIntoView({ behavior: 'smooth' });
            });
        }
    });
}


/* ---------------------------------------------------------
   Book a pickup (pop-up form)
   --------------------------------------------------------- */

const bookForm = $('bookForm');
const bookDone = $('bookDone');
let lastBookedId = '';

function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

// Called by the "Continue to Pickup" button and by any [data-book] button
function openBooking() {
    if (!bookDialog) return;
    if (cartItems && cartCount() === 0) return;     // bag is empty

    bookForm.hidden = false;
    bookDone.hidden = true;

    const dateInput = $('bDate');
    dateInput.min = todayISO();
    if (!dateInput.value) dateInput.value = todayISO();

    if (!bookDialog.open) bookDialog.showModal();
}

document.querySelectorAll('[data-book]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        openBooking();
    })
);

if (bookForm) {
    const phoneInput = $('bPhone');
    phoneInput.addEventListener('input', () => phoneInput.setCustomValidity(''));

    const submitBtn = bookForm.querySelector('.confirm-btn');

    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Indian mobile number: 10 digits starting with 6-9 (a +91 or 0 prefix is fine)
        const digits = phoneInput.value.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
        if (!/^[6-9]\d{9}$/.test(digits)) {
            phoneInput.setCustomValidity('Enter a valid 10-digit mobile number.');
            phoneInput.reportValidity();
            return;
        }

        const data = new FormData(bookForm);
        const when = new Date(data.get('date') + 'T00:00:00')
            .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const slot = data.get('slot');
        const serviceSelect = bookForm.elements['service'];
        const service = serviceSelect.selectedOptions[0].textContent.trim();

        let summary = service;
        if (cartItems) {
            const count = cartCount();
            summary = count + (count === 1 ? ' item' : ' items') + DOT + RUPEE + (cartSubtotal() + DELIVERY_FEE);
        }

        const id = nextOrderId();
        const order = {
            current: 0,
            etaLabel: 'Pickup scheduled',
            eta: when + ', ' + slot,
            times: ['Just now'],
            summary: summary,
        };

        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Booking…'; }
        await saveOrder(id, order);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Pickup'; }

        lastBookedId = id;

        $('bookDoneId').textContent = id;
        $('bookDoneText').textContent =
            'Thanks, ' + data.get('name').trim().split(' ')[0] + '. A rider will arrive on ' + when + ' between ' + slot + '.';

        bookForm.hidden = true;
        bookDone.hidden = false;
        bookForm.reset();

        if (cartItems) {
            Object.keys(cart).forEach((k) => delete cart[k]);
            renderCart();
        }
    });

    $('bookTrack').addEventListener('click', () => {
        bookDialog.close();
        showOrder(lastBookedId, ORDERS[lastBookedId], false);
    });

    $('bookAnother').addEventListener('click', () => {
        if (cartItems) {
            // booking page: go back to picking clothes
            bookDialog.close();
            document.querySelector('.clothes-section').scrollIntoView({ behavior: 'smooth' });
        } else {
            openBooking();
        }
    });
}


/* ---------------------------------------------------------
   Landing page: track form, menu, order card, scroll line
   --------------------------------------------------------- */

const trackForm = $('trackForm');

if (trackForm) {
    const trackInput = $('orderId');
    const trackMsg = $('trackMsg');
    const trackSubmitBtn = trackForm.querySelector('button[type="submit"]');

    trackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = trackInput.value.trim().toUpperCase();
        trackMsg.classList.remove('error');

        if (!id) {
            trackMsg.textContent = 'Enter your order ID to track it.';
            trackMsg.classList.add('error');
            return;
        }

        if (trackSubmitBtn) trackSubmitBtn.disabled = true;
        const order = await findOrder(id);
        if (trackSubmitBtn) trackSubmitBtn.disabled = false;

        if (!order) {
            trackMsg.textContent = 'We could not find order ' + id + '. Check the ID and try again.';
            trackMsg.classList.add('error');
            return;
        }
        trackMsg.textContent = 'Showing the latest status for ' + id + '.';
        showOrder(id, order, false);
    });
}

// Mobile menu
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = $('nav-links');

if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
        const open = navLinks.classList.toggle('open');
        menuToggle.setAttribute('aria-expanded', open);
        menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    navLinks.querySelectorAll('a').forEach((a) =>
        a.addEventListener('click', () => {
            navLinks.classList.remove('open');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.setAttribute('aria-label', 'Open menu');
        })
    );
}

// Hero order card that cycles through stages (sample data)
const tracker = document.querySelector('.tracker');

if (tracker) {
    const demo = [
        { badge: 'Picked up', note: 'Rider collected 8 items', pct: 25 },
        { badge: 'Washing', note: 'Cold wash' + DOT + '40 min left', pct: 50 },
        { badge: 'Drying', note: 'Tumble dry' + DOT + '25 min left', pct: 75 },
        { badge: 'Out for delivery', note: 'Arriving by 6:00 PM', pct: 100 },
    ];
    const badge = $('trackerBadge');
    const note = $('trackerNote');
    const fill = $('trackerFill');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 1;

    const show = (s) => {
        badge.textContent = s.badge;
        note.textContent = s.note;
        fill.style.width = s.pct + '%';
    };
    show(demo[i]);

    if (!reduceMotion) {
        setInterval(() => {
            tracker.classList.add('is-swapping');
            setTimeout(() => {
                i = (i + 1) % demo.length;
                show(demo[i]);
                tracker.classList.remove('is-swapping');
            }, 300);
        }, 3200);
    }
}

// "How it works" line draws itself when scrolled into view
const steps = $('steps');

if (steps) {
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries, obs) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    steps.classList.add('in');
                    obs.disconnect();
                }
            });
        }, { threshold: 0.4 }).observe(steps);
    } else {
        steps.classList.add('in');
    }
}

// Footer year
if ($('year')) $('year').textContent = new Date().getFullYear();


/* ---------------------------------------------------------
   Expose functions used by inline onclick="" attributes in
   the HTML. Needed because this file is now a module, and
   modules don't put their top-level functions on `window`
   automatically the way plain scripts do.
   --------------------------------------------------------- */
window.addClothes = addClothes;
window.openBooking = openBooking;