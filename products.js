/*
 * products.js
 * Product listing module for the Mini Marketplace.
 *
 * Integration contract:
 * When a user clicks Add to Cart, this module dispatches:
 * document event: "add-to-cart"
 * event.detail: { id, title, price, category, thumbnail, stock }
 *
 * The Cart module should listen for that event and call its addItem()
 * method. This file does not create or manage the cart itself.
 */

"use strict";

// 1. Select the HTML elements used by this module.
const productsContainer = document.getElementById("productsContainer");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const loadingMessage = document.getElementById("loadingMessage");
const errorMessage = document.getElementById("errorMessage");
const resultsCount = document.getElementById("resultsCount");

// 2. Store the original products and the currently displayed products.
let allProducts = [];
let displayedProducts = [];

const PRODUCTS_API = "https://dummyjson.com/products?limit=20";
const CATEGORIES_API = "https://dummyjson.com/products/category-list";
const LOCAL_BACKUP = "products.json";

// Format prices consistently. DummyJSON prices are displayed in USD.
const formatPrice = (price) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(price);

// Convert API records to the shared product shape agreed by the team.
function normalizeProduct(product) {
  return {
    id: Number(product.id),
    title: String(product.title ?? "Untitled product"),
    price: Number(product.price) || 0,
    category: String(product.category ?? "uncategorized"),
    thumbnail: String(product.thumbnail ?? ""),
    stock: Number(product.stock) || 0
  };
}

// 3. Fetch products from DummyJSON, then try the local backup if needed.
async function fetchProducts() {
  showLoading("Loading products…");
  hideError();

  try {
    const response = await fetch(PRODUCTS_API);

    if (!response.ok) {
      throw new Error(`Product API returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.products)) {
      throw new Error("The product API returned an unexpected response.");
    }

    allProducts = data.products.map(normalizeProduct);
    displayedProducts = [...allProducts];

    renderProducts(displayedProducts);
    await loadCategories();
    updateResultsCount();
  } catch (apiError) {
    console.warn("Could not load products from the API. Trying backup.", apiError);

    try {
      const backupResponse = await fetch(LOCAL_BACKUP);

      if (!backupResponse.ok) {
        throw new Error(`Local backup returned HTTP ${backupResponse.status}`);
      }

      const backupProducts = await backupResponse.json();

      if (!Array.isArray(backupProducts)) {
        throw new Error("The local product backup must contain an array.");
      }

      allProducts = backupProducts.map(normalizeProduct);
      displayedProducts = [...allProducts];

      renderProducts(displayedProducts);
      await loadCategories();
      updateResultsCount();
      showError("The live product service is unavailable. Showing locally saved products.");
    } catch (backupError) {
      console.error("Could not load the local product backup.", backupError);
      allProducts = [];
      displayedProducts = [];
      renderProducts([]);
      updateResultsCount();
      showError("We couldn't load products right now. Please refresh the page and try again.");
    }
  } finally {
    hideLoading();
  }
}

// 4. Fetch categories and populate the dropdown.
// If that endpoint fails, derive categories from the products already loaded.
async function loadCategories() {
  const categories = new Set();

  try {
    const response = await fetch(CATEGORIES_API);

    if (!response.ok) {
      throw new Error(`Category API returned HTTP ${response.status}`);
    }

    const apiCategories = await response.json();

    if (!Array.isArray(apiCategories)) {
      throw new Error("The category API returned an unexpected response.");
    }

    apiCategories.forEach((category) => categories.add(String(category)));
  } catch (error) {
    console.warn("Using product data to build the category list.", error);

    allProducts.forEach((product) => {
      categories.add(product.category);
    });
  }

  // Keep the default "All categories" option and remove old options.
  categoryFilter.replaceChildren(new Option("All categories", "all"));

  [...categories].sort().forEach((category) => {
    categoryFilter.add(new Option(formatCategory(category), category));
  });
}

// Make category labels easier to read without changing their actual values.
function formatCategory(category) {
  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// 5. Render product cards using map().
function renderProducts(products) {
  productsContainer.replaceChildren();

  if (products.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-state";
    emptyMessage.textContent = "No products match your search. Try another keyword or category.";
    productsContainer.append(emptyMessage);
    return;
  }

  const productCards = products.map((product) => createProductCard(product));
  productsContainer.append(...productCards);
}

// Create one product card safely using DOM methods and textContent.
function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const imageWrap = document.createElement("div");
  imageWrap.className = "product-image-wrap";

  if (product.thumbnail) {
    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.thumbnail;
    image.alt = product.title;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
      const fallback = document.createElement("span");
      fallback.className = "product-image-fallback";
      fallback.textContent = "Image unavailable";
      imageWrap.append(fallback);
    }, { once: true });
    imageWrap.append(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "product-image-fallback";
    fallback.textContent = "Image unavailable";
    imageWrap.append(fallback);
  }

  const details = document.createElement("div");
  details.className = "product-details";

  const category = document.createElement("p");
  category.className = "product-category";
  category.textContent = formatCategory(product.category);

  const title = document.createElement("h3");
  title.className = "product-title";
  title.textContent = product.title;

  const stock = document.createElement("p");
  stock.className = "product-stock";
  stock.textContent = product.stock > 0
    ? `${product.stock} in stock`
    : "Out of stock";

  const bottom = document.createElement("div");
  bottom.className = "product-bottom";

  const price = document.createElement("span");
  price.className = "product-price";
  price.textContent = formatPrice(product.price);

  const addButton = document.createElement("button");
  addButton.className = "add-to-cart-button";
  addButton.type = "button";
  addButton.textContent = product.stock > 0 ? "Add to cart" : "Out of stock";
  addButton.dataset.productId = String(product.id);
  addButton.disabled = product.stock <= 0;
  addButton.setAttribute("aria-label", `Add ${product.title} to cart`);

  bottom.append(price, addButton);
  details.append(category, title, stock, bottom);
  card.append(imageWrap, details);

  return card;
}

// 6. Apply search and category filters together.
function filterProducts() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;

  displayedProducts = allProducts.filter((product) => {
    const matchesSearch = product.title.toLowerCase().includes(searchTerm);
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  renderProducts(displayedProducts);
  updateResultsCount();
}

// 7. Send the selected product to the Cart module using a custom event.
productsContainer.addEventListener("click", (event) => {
  const addButton = event.target.closest("button[data-product-id]");

  if (!addButton || !productsContainer.contains(addButton)) {
    return;
  }

  const productId = Number(addButton.dataset.productId);
  const selectedProduct = allProducts.find((product) => product.id === productId);

  if (!selectedProduct || selectedProduct.stock <= 0) {
    return;
  }

  document.dispatchEvent(
    new CustomEvent("add-to-cart", {
      detail: { ...selectedProduct }
    })
  );

  // The Cart module can listen for "cart-item-added" if it wants to
  // trigger a small confirmation message in the products interface.
  document.dispatchEvent(
    new CustomEvent("product-added-to-cart", {
      detail: { ...selectedProduct }
    })
  );
});

// Small UI helper functions keep loading and error handling consistent.
function showLoading(message) {
  loadingMessage.textContent = message;
  loadingMessage.hidden = false;
}

function hideLoading() {
  loadingMessage.hidden = true;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function hideError() {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

function updateResultsCount() {
  const total = displayedProducts.length;
  resultsCount.textContent = `${total} product${total === 1 ? "" : "s"} found`;
}

// 8. Connect user interactions to the filtering function.
searchInput.addEventListener("input", filterProducts);
categoryFilter.addEventListener("change", filterProducts);

// Start loading products when this script runs.
// The script is loaded with "defer", so the HTML elements already exist.
fetchProducts();
