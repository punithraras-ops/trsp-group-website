const TrspCart = (() => {
    const STORAGE_KEY = 'trsp_cart';

    function getCart() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function saveCart(cart) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        updateBadge();
    }

    function addToCart(productId, quantity = 1) {
        const cart = getCart();
        const existing = cart.find(item => item.productId === productId);
        if (existing) {
            existing.quantity = Math.min(20, existing.quantity + quantity);
        } else {
            cart.push({ productId, quantity: Math.min(20, quantity) });
        }
        saveCart(cart);
    }

    function updateQuantity(productId, quantity) {
        let cart = getCart();
        if (quantity <= 0) {
            cart = cart.filter(item => item.productId !== productId);
        } else {
            const existing = cart.find(item => item.productId === productId);
            if (existing) existing.quantity = Math.min(20, quantity);
        }
        saveCart(cart);
    }

    function removeFromCart(productId) {
        saveCart(getCart().filter(item => item.productId !== productId));
    }

    function clearCart() {
        saveCart([]);
    }

    function count() {
        return getCart().reduce((sum, item) => sum + item.quantity, 0);
    }

    function updateBadge() {
        document.querySelectorAll('[data-cart-count]').forEach(el => {
            const n = count();
            el.textContent = n;
            el.classList.toggle('d-none', n === 0);
        });
    }

    document.addEventListener('DOMContentLoaded', updateBadge);

    return { getCart, addToCart, updateQuantity, removeFromCart, clearCart, count, updateBadge };
})();
