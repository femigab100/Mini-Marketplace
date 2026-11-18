/*
 * cart.js
 * Shopping cart module for MiniMart.
 *
 * Integration contract:
 * - Listens for the document event "add-to-cart" (sent by products.js).
 *   event.detail: { id, title, price, category, thumbnail, stock }
 * - After every change it dispatches the document event "cart-updated".
 *   event.detail: { items, total, count }
 * - When the shopper clicks Checkout it dispatches "checkout-requested".
 *   event.detail: { items, total }
 * - The shared cart is available to other scripts as `cart`:
 *   cart.getItems(), cart.getTotal(), cart.getItemCount(), cart.clear(), cart.setItems(items)
 *
 * The cart panel is built with JavaScript, so index.html does not need any cart markup.
 */

"use strict";

// 1. The Cart class stores the items and does the maths.
// Cart item shape: { id, title, price, quantity, thumbnail, stock }
class Cart {
  constructor() {
    this.items = [];
  }

  // Add one unit of a product. Returns false when the stock limit is already reached.
  addItem(product) {
    const existingItem = this.items.find((item) => item.id === product.id);

    if (existingItem) {
      if (existingItem.quantity >= existingItem.stock) {
        return false;
      }
      existingItem.quantity += 1;
    } else {
      this.items.push({
        id: product.id,
        title: product.title,
        price: product.price,
        quantity: 1,
        thumbnail: product.thumbnail,
        stock: product.stock
      });
    }

    this.notify();
    return true;
  }

  removeItem(id) {
    this.items = this.items.filter((item) => item.id !== id);
    this.notify();
  }

  // Set a new quantity. 0 or less removes the item; more than the stock is capped.
  updateQuantity(id, quantity) {
    const item = this.items.find((cartItem) => cartItem.id === id);
    const newQuantity = Math.floor(Number(quantity));

    if (!item || Number.isNaN(newQuantity)) {
      return;
    }

    if (newQuantity <= 0) {
      this.removeItem(id);
      return;
    }

    item.quantity = Math.min(newQuantity, item.stock);
    this.notify();
  }

  getTotal() {
    const total = this.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Round to 2 decimals to avoid floating point errors such as 0.1 + 0.2
    return Math.round(total * 100) / 100;
  }

  // Total number of units in the cart (2 phones + 1 mug = 3)
  getItemCount() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  // Return a copy so other modules cannot change the cart by accident.
  getItems() {
    return this.items.map((item) => ({ ...item }));
  }

  clear() {
    this.items = [];
    this.notify();
  }

  // Replace the contents, for example when restoring a saved cart.
  setItems(items) {
    if (!Array.isArray(items)) {
      return;
    }

    this.items = items
      .map(normalizeCartItem)
      .filter((item) => item !== null);
    this.notify();
  }

  // Tell the rest of the page that the cart changed.
  notify() {
    document.dispatchEvent(
      new CustomEvent("cart-updated", {
        detail: {
          items: this.getItems(),
          total: this.getTotal(),
          count: this.getItemCount()
        }
      })
    );
  }

  // Format prices consistently. Prices are displayed in USD, like the product cards.
  static formatPrice(amount) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount);
  }
}

// Clean up a saved item. Returns null when the item is not usable.
function normalizeCartItem(item) {
  if (!item) {
    return null;
  }

  const id = Number(item.id);
  const price = Number(item.price);
  const quantity = Math.floor(Number(item.quantity));
  const stock = Number(item.stock) > 0 ? Number(item.stock) : 99;

  if (Number.isNaN(id) || Number.isNaN(price) || !(quantity >= 1)) {
    return null;
  }

  return {
    id,
    title: String(item.title ?? "Untitled product"),
    price,
    quantity: Math.min(quantity, stock),
    thumbnail: String(item.thumbnail ?? ""),
    stock
  };
}

// The single shared cart used by the whole page.
const cart = new Cart();

// 2. Select the header elements that already exist in index.html.
const cartButton = document.getElementById("cartButton");
const cartCount = document.getElementById("cartCount");

// 3. Create the cart panel with JavaScript.
function makeElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

const cartOverlay = makeElement("div", "cart-overlay");

const cartPanel = makeElement("aside", "cart-panel");
cartPanel.id = "cartPanel";
cartPanel.setAttribute("aria-label", "Shopping cart");

const cartCloseButton = makeElement("button", "cart-close-button", "×");
cartCloseButton.type = "button";
cartCloseButton.setAttribute("aria-label", "Close cart");

const cartPanelHeader = makeElement("div", "cart-panel-header");
cartPanelHeader.append(makeElement("h2", "cart-panel-title", "Your cart"), cartCloseButton);

const cartStatus = makeElement("p", "cart-status");
cartStatus.setAttribute("role", "status");

const cartItemsBox = makeElement("div", "cart-items");

const cartTotal = makeElement("strong", "cart-total-amount");
const cartTotalRow = makeElement("div", "cart-total-row");
cartTotalRow.append(makeElement("span", "", "Total"), cartTotal);

const cartCheckoutButton = makeElement("button", "cart-checkout-button", "Checkout");
cartCheckoutButton.type = "button";

const cartPanelFooter = makeElement("div", "cart-panel-footer");
cartPanelFooter.append(cartTotalRow, cartCheckoutButton);

cartPanel.append(cartPanelHeader, cartStatus, cartItemsBox, cartPanelFooter);

// Both start closed.
cartOverlay.hidden = true;
cartPanel.hidden = true;
document.body.append(cartOverlay, cartPanel);

cartButton.setAttribute("aria-controls", "cartPanel");
cartButton.setAttribute("aria-expanded", "false");

// 4. Render the cart: header badge, item rows, total and checkout button.
function renderCart() {
  cartStatus.textContent = "";
  cartItemsBox.replaceChildren();

  if (cart.items.length === 0) {
    cartItemsBox.append(makeElement("p", "cart-empty", "Your cart is empty"));
  } else {
    const rows = cart.items.map((item) => createCartRow(item));
    cartItemsBox.append(...rows);
  }

  cartTotal.textContent = Cart.formatPrice(cart.getTotal());
  cartCheckoutButton.disabled = cart.items.length === 0;
  updateBadge();
}

function updateBadge() {
  const count = cart.getItemCount();

  cartCount.textContent = count;
  cartButton.setAttribute(
    "aria-label",
    `View cart, ${count} item${count === 1 ? "" : "s"}`
  );
}

// Create one row safely using DOM methods and textContent.
function createCartRow(item) {
  const row = makeElement("article", "cart-row");

  const imageWrap = makeElement("div", "cart-row-image");
  if (item.thumbnail) {
    const image = document.createElement("img");
    image.src = item.thumbnail;
    image.alt = item.title;
    imageWrap.append(image);
  }

  const details = makeElement("div", "cart-row-details");
  const title = makeElement("h3", "cart-row-title", item.title);
  const unitPrice = makeElement("p", "cart-row-price", `${Cart.formatPrice(item.price)} each`);

  const decreaseButton = createCartButton("−", "decrease", item, `Decrease quantity of ${item.title}`);
  decreaseButton.disabled = item.quantity <= 1;

  const quantity = makeElement("span", "cart-quantity-value", String(item.quantity));

  const increaseButton = createCartButton("+", "increase", item, `Increase quantity of ${item.title}`);
  increaseButton.disabled = item.quantity >= item.stock;

  const quantityBox = makeElement("div", "cart-quantity");
  quantityBox.append(decreaseButton, quantity, increaseButton);

  const lineTotal = makeElement("p", "cart-row-total", Cart.formatPrice(item.price * item.quantity));

  const controls = makeElement("div", "cart-row-controls");
  controls.append(quantityBox, lineTotal);

  const removeButton = createCartButton("Remove", "remove", item, `Remove ${item.title} from cart`);
  removeButton.classList.add("cart-remove-button");

  details.append(title, unitPrice, controls, removeButton);
  row.append(imageWrap, details);

  return row;
}

// Buttons carry data attributes, so one click listener can handle them all.
function createCartButton(label, action, item, accessibleName) {
  const button = makeElement("button", "cart-quantity-button", label);
  button.type = "button";
  button.dataset.action = action;
  button.dataset.itemId = String(item.id);
  button.setAttribute("aria-label", accessibleName);
  return button;
}

// 5. Open and close the panel.
function openCart() {
  cartOverlay.hidden = false;
  cartPanel.hidden = false;
  cartButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("cart-open");
  cartCloseButton.focus();
}

function closeCart() {
  cartOverlay.hidden = true;
  cartPanel.hidden = true;
  cartButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("cart-open");
  cartButton.focus();
}

function toggleCart() {
  if (cartPanel.hidden) {
    openCart();
  } else {
    closeCart();
  }
}

// 6. Connect events.

// Products module -> cart: a product was added.
document.addEventListener("add-to-cart", (event) => {
  const product = event.detail;

  if (!product) {
    return;
  }

  const wasAdded = cart.addItem(product);

  // Stock limit reached: open the cart so the shopper sees why nothing changed.
  if (!wasAdded) {
    cartStatus.textContent =
      `You already have all ${product.stock} available ${product.title} in your cart.`;
    openCart();
  }
});

// Any cart change -> redraw the panel and the header badge.
document.addEventListener("cart-updated", renderCart);

// Quantity buttons and Remove buttons (event delegation).
cartItemsBox.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const id = Number(button.dataset.itemId);
  const item = cart.items.find((cartItem) => cartItem.id === id);

  if (!item) {
    return;
  }

  if (button.dataset.action === "increase") {
    cart.updateQuantity(id, item.quantity + 1);
  } else if (button.dataset.action === "decrease") {
    cart.updateQuantity(id, item.quantity - 1);
  } else if (button.dataset.action === "remove") {
    cart.removeItem(id);
  }
});

cartButton.addEventListener("click", toggleCart);
cartCloseButton.addEventListener("click", closeCart);
cartOverlay.addEventListener("click", closeCart);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !cartPanel.hidden) {
    closeCart();
  }
});

// Checkout module / main.js listen for this event to show the checkout screen.
cartCheckoutButton.addEventListener("click", () => {
  closeCart();

  document.dispatchEvent(
    new CustomEvent("checkout-requested", {
      detail: { items: cart.getItems(), total: cart.getTotal() }
    })
  );
});

// Draw the empty cart when the page first loads.
renderCart();