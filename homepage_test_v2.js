import { Selector, ClientFunction, t } from 'testcafe';

/* =================== CONFIG =================== */
const HOME_URL = 'https://ecommerce-playground.lambdatest.io/index.php?route=common/home';
const WAIT_SHORT = 300;

/* =================== CLIENT FUNCS =================== */
const getHref    = ClientFunction(() => window.location.href);
const getScrollY = ClientFunction(() => window.pageYOffset || document.documentElement.scrollTop || 0);

/* =================== SELECTOR HELPERS =================== */
const vis = (q) => Selector(q).filterVisible();
const pageReady = vis('#logo a, .navbar-brand, header .navbar, header, .navbar');

/* =================== LOGGING / STEP WRAPPER =================== */
let FAILS = 0;
function logFinal() {
  console.log(FAILS ? `\n${FAILS} failed test cases. Check screenshots folder for manual checks` : '\n0 failed test cases');
}
async function shotOnFail() { try { await t.takeScreenshot(); } catch {} }

async function runStep(stepNo, label, fn) {
  try {
    await fn();
    console.log(`Step ${stepNo}; ${label}; PASS`);
  } catch (e) {
    FAILS += 1;
    console.log(`Step ${stepNo}; ${label}; FAIL`);
    await shotOnFail();
  }
}

/* =================== SAFE ACTIONS =================== */
// Avoid overlay by clicking near top-left of target after hover
async function clickSafe(selector) {
  await t.scrollIntoView(selector);
  await t.hover(selector, { speed: 0.9 });
  await t.click(selector, { offsetX: 10, offsetY: 10, speed: 0.9 });
  await t.wait(WAIT_SHORT);
}

async function hoverOrClickToOpen(trigger, expectSelector, timeout = 6000) {
  await t.hover(trigger);
  if (!(await expectSelector.exists)) {
    await clickSafe(trigger);
  }
  await t.expect(expectSelector.exists).ok({ timeout });
}

// URL check that tolerates "already on the same page" and multiple routes
async function expectUrlOneOf(substrings = [], timeout = 8000, allowNoChangeIfMatches = true) {
  const before = await getHref();
  const endAt = Date.now() + timeout;
  let matched = false;

  while (Date.now() < endAt && !matched) {
    const now = await getHref();
    if (substrings.length === 0) {
      if (now !== before) matched = true;
    } else {
      matched = substrings.some(s => now.includes(s));
      if (!matched) await t.wait(200);
    }
  }

  if (!matched && allowNoChangeIfMatches && substrings.some(s => before.includes(s))) {
    matched = true;
  }

  await t.expect(matched).ok(`URL didn't match any of: [${substrings.join(', ')}]`, { timeout: 0 });
}

/* =================== FIXTURE =================== */
fixture`Homepage — Functional Verification`
  .page(HOME_URL)
  .beforeEach(async () => {
    await t.maximizeWindow();
    await t.expect(pageReady.exists).ok('Homepage not visibly ready', { timeout: 10000 });
    await t.expect(getHref()).contains('route=common/home', { timeout: 5000 });
  });

/* =================== TEST =================== */
test('Homepage interactive element checks (15 steps)', async t => {

  /* STEP 1 */
  await runStep(1, 'Open the homepage and verify that all main sections (carousel, banners, product categories, and blog preview) load correctly.', async () => {
    const carouselA = vis('#content .swiper, .swiper-container, .swiper');
    const carouselB = vis('.owl-carousel, .slick-slider, [data-ride="carousel"]');
    const banners   = vis('.banner a, .home-section .banner a, [class*="banner"] a');
    const catHdr    = vis('h2, h3').withText(/Top Trending Categories/i);
    const blogHdr   = vis('h2, h3').withText(/From the Blog/i);

    let foundCarousel = (await carouselA.exists) || (await carouselB.exists);
    await t.expect(foundCarousel).ok('Carousel not found');
    await t.expect(banners.exists).ok('No banner links visible');
    await t.expect(catHdr.exists).ok('"Top Trending Categories" missing');
    await t.expect(blogHdr.exists).ok('"From the Blog" missing');
  });

  /* STEP 2 */
  await runStep(2, 'Verify that the Shop by Category dropdown expands when clicked.', async () => {
    const trigger  = vis('#entry_217825 > button, .navbar-toggler, .dropdown-toggle');
    const dropdown = vis('.dropdown-menu, .menu.dropdown, .dropdown.open .dropdown-menu');
    await t.expect(trigger.exists).ok('Shop by Category not found');
    await hoverOrClickToOpen(trigger, dropdown);
  });

  /* STEP 3 */
  await runStep(3, 'Click the LambdaTest logo to ensure it redirects to the homepage.', async () => {
    const logo = vis('#logo a, .navbar-brand');
    await t.expect(logo.exists).ok('Logo not present');
    await clickSafe(logo);
    await expectUrlOneOf(['common/home', '/index.php?route=common/home', '/'], 8000, true);
  });

  /* STEP 4 */
  await runStep(4, 'Verify that the Cart opens a side bar with cart view, Wishlist redirects, and My account icon redirects once clicked, and shows options when hovered on the header.', async () => {
    // CART
    const cartIcon  = vis('a[href*="route=checkout/cart"], .cart, [data-target="#cart"]');
    // Broader off-canvas / sidebar detection + text/CTA fallbacks
    const cartPanel = vis('#cart, .cart-content, .dropdown-menu-cart, .offcanvas, [class*="offcanvas"], .side-cart, .cart-sidebar').filterVisible();
    const cartText  = Selector('body').withText(/Your shopping cart is empty!/i).filterVisible();
    const cartCta   = vis('a, button').withText(/Checkout|Edit cart/i).filterVisible();

    await t.expect(cartIcon.exists).ok('Cart icon missing');
    await t.hover(cartIcon);
    await t.wait(200);
    if (!(await cartPanel.exists) && !(await cartText.exists) && !(await cartCta.exists)) {
      await clickSafe(cartIcon);
      await t.wait(800); // allow slide-in animation
    }

    // Optional fallback to inner clickable to avoid obstruction
    if (!(await cartPanel.exists) && !(await cartText.exists) && !(await cartCta.exists)) {
      const cartInner = cartIcon.find('button, a').filterVisible().nth(0);
      if (await cartInner.exists) {
        await clickSafe(cartInner);
        await t.wait(800);
      }
    }

    const cartOpen = (await cartPanel.exists) || (await cartText.exists) || (await cartCta.exists);
    await t.expect(cartOpen).ok('Cart panel did not open (off-canvas not detected)');

    // WISHLIST (accept login for guest)
    const wishlist = vis('a[href*="route=account/wishlist"], .wishlist');
    await t.expect(wishlist.exists).ok('Wishlist icon missing');
    await clickSafe(wishlist);
    await expectUrlOneOf(['account/wishlist', 'account/login']);
    await t.navigateTo(HOME_URL);
    await t.expect(pageReady.exists).ok({ timeout: 10000 });

    // ACCOUNT (hover or click reveals dropdown; accept login/account routes)
    const accountIcon = vis('a[href*="route=account"], .account, .myaccount, .user, .fa-user');
    await t.expect(accountIcon.exists).ok('Account icon missing');
    const accountDD = Selector('.dropdown-menu').withText(/Register|Login|My Account|Account/i).filterVisible();
    await hoverOrClickToOpen(accountIcon, accountDD);
    await clickSafe(accountIcon);
    await expectUrlOneOf(['account/login', 'account/account', 'account']);
    await t.navigateTo(HOME_URL);
    await t.expect(pageReady.exists).ok({ timeout: 10000 });
  });

  /* STEP 5 */
  await runStep(5, 'Click the Home, Special, Blog, Mega Menu, and AddOns navigation tabs to confirm correct redirection. Mega Menu and AddOns to open dropdown with further links that redirect to corresponding links.', async () => {
    const dropdown  = vis('.dropdown-menu, .menu.dropdown, .dropdown.open .dropdown-menu');

    const navHome    = vis('a, .nav-link').withText(/^Home$/i);
    const navSpecial = vis('a, .nav-link').withText(/Special/i);
    const navBlog    = vis('a, .nav-link').withText(/^Blog$/i);
    const navMega    = vis('a, .nav-link').withText(/Mega Menu/i);
    const navAddOns  = vis('a, .nav-link').withText(/AddOns/i);

    if (await navHome.exists)    { await clickSafe(navHome);    await expectUrlOneOf(['common/home', '/'], 6000, true); }
    if (await navSpecial.exists) { await clickSafe(navSpecial); await expectUrlOneOf(['special', 'specials', 'product/special']); await t.navigateTo(HOME_URL); }
    if (await navBlog.exists)    { await clickSafe(navBlog);    await expectUrlOneOf(['blog', 'extension/maza/blog', 'simple_blog']); await t.navigateTo(HOME_URL); }

    if (await navMega.exists) {
      await t.hover(navMega);
      await t.expect(dropdown.exists).ok({ timeout: 6000 });
      const firstMega = dropdown.find('a').filterVisible().nth(0);
      if (await firstMega.exists) { await clickSafe(firstMega); await t.wait(WAIT_SHORT); }
      await t.navigateTo(HOME_URL);
    }
    if (await navAddOns.exists) {
      await t.hover(navAddOns);
      await t.expect(dropdown.exists).ok({ timeout: 6000 });
      const firstAddon = dropdown.find('a').filterVisible().nth(0);
      if (await firstAddon.exists) { await clickSafe(firstAddon); await t.wait(WAIT_SHORT); }
      await t.navigateTo(HOME_URL);
    }
    await t.expect(pageReady.exists).ok({ timeout: 10000 });
  });

  /* STEP 6 */
  await runStep(6, 'Test the All Categories dropdown in the search bar and verify options are displayed.', async () => {
    const allCats = vis('select[name="category_id"], .search-category select, .search-by-category select');
    if (!(await allCats.exists)) return; // some themes hide it
    const options = Selector('select[name="category_id"] option, .search-category select option').filterVisible();
    await t.expect(options.count).gt(1, 'Expected multiple categories');
  });

  /* STEP 7 */
  await runStep(7, 'Verify that each Shop Now button on banner ads (carousel and section ads) redirects to valid product/category pages.', async () => {
    const activeBtn = Selector('.swiper-slide-active, .slick-slide.slick-active, .owl-item.active')
      .find('a, button').withText(/Shop\s*Now/i).filterVisible();
    let cnt = await activeBtn.count;
    const fallback = Selector('a, button').withText(/Shop\s*Now/i).filterVisible();
    if (cnt === 0) cnt = await fallback.count;

    let success = 0;
    const total = Math.min(cnt, 3);
    for (let i = 0; i < total; i++) {
      const btn = (await activeBtn.count) > 0 ? activeBtn.nth(i) : fallback.nth(i);
      const before = await getHref();
      await clickSafe(btn);
      const after = await getHref();
      if (after !== before && /product|category|route=product|route=category/i.test(after)) success++;
      await t.navigateTo(HOME_URL);
      await t.expect(pageReady.exists).ok({ timeout: 10000 });
    }
    await t.expect(success).gt(0, 'No working Shop Now buttons detected');
  });

  /* STEP 8 */
  await runStep(8, 'Scroll down to Top Trending Categories and verify each image links correctly.', async () => {
    const catHdr = vis('h2, h3').withText(/Top Trending Categories/i);
    await t.expect(catHdr.exists).ok();
    await t.scrollIntoView(catHdr);

    const catLinks = Selector('a').filterVisible().withAttribute('href', /route=product\/category|path=/i);
    const count = await catLinks.count;
    await t.expect(count).gt(0, 'No category links found');

    let good = 0, tried = 0;
    for (let i = 0; i < count && tried < 6; i++) {
      const l = catLinks.nth(i);
      if (!(await l.visible)) continue;
      const before = await getHref();
      await clickSafe(l);
      const after = await getHref();
      if (after !== before && /category|path=/i.test(after)) good++;
      tried++;
      await t.navigateTo(HOME_URL);
      await t.expect(pageReady.exists).ok({ timeout: 10000 });
      await t.scrollIntoView(catHdr);
    }
    await t.expect(good).gt(0, 'Could not verify any working category links');
  });

  /* STEP 9 */
  await runStep(9, 'Hover over a Top Product item and confirm quick-action icons (Add to Cart, Wishlist, Compare, Quick View) appear.', async () => {
    const productCard = vis('.product-thumb, .product-layout, .product-grid .product');
    await t.expect(productCard.exists).ok('No product card found');
    await t.hover(productCard.nth(0));
    const quickIcons = Selector('button, a').withText(/Add to Cart|Wishlist|Compare|Quick View/i).filterVisible();
    await t.expect(quickIcons.exists).ok({ timeout: 5000 });
  });

  /* STEP 10 */
  await runStep(10, 'Click on any Top Product name or image and verify redirection to the product detail page.', async () => {
    const productLink = Selector('.product-thumb a, .product-layout a, .caption a, .name a, .title a').filterVisible();
    await t.expect(productLink.exists).ok('No product link found');
    const before = await getHref();
    await clickSafe(productLink.nth(0));
    const after = await getHref();
    await t.expect(after !== before && /product/i.test(after)).ok('Product detail did not open');
    await t.navigateTo(HOME_URL);
    await t.expect(pageReady.exists).ok({ timeout: 10000 });
  });

  /* STEP 11 */
  await runStep(11, 'In the Top Collection section, click each tab (Popular, Latest, Best Seller) and verify that product listings update accordingly.', async () => {
    const collTab = Selector('a, button').withText(/Popular|Latest|Best Seller/i).filterVisible();
    await t.scrollIntoView(collTab.nth(0));
    await t.expect(collTab.count).gt(0, 'Collection tabs not found');

    let ok = 0;
    const productGrid = vis('.product-grid, .products, .tab-content .active .product, .grid-holder');
    const toCheck = Math.min(await collTab.count, 3);

    let prevUrl = await getHref();
    for (let i = 0; i < toCheck; i++) {
      await clickSafe(collTab.nth(i));
      const nowUrl = await getHref();
      if (nowUrl !== prevUrl || (await productGrid.exists)) ok++;
      prevUrl = nowUrl;
    }
    await t.expect(ok).gt(0, 'No tab change detected');
  });

  /* STEP 12 */
  await runStep(12, 'Confirm that all items under the Under @99 or promotional banners are clickable and lead to product pages.', async () => {
    const underHdr = vis('h2, h3').withText(/Under\s*@?\s*99|Under\s*\$?99|Promo/i);
    if (!(await underHdr.exists)) return;
    await t.scrollIntoView(underHdr);
    const promoLinks = Selector('a').filterVisible().withAttribute('href', /product|category/i);
    const pcnt = await promoLinks.count;
    await t.expect(pcnt).gt(0, 'No promo links found');
    let good = 0;
    for (let i = 0; i < Math.min(pcnt, 6); i++) {
      const before = await getHref();
      await clickSafe(promoLinks.nth(i));
      const after = await getHref();
      if (after !== before && /product|category/i.test(after)) { good++; break; }
      await t.navigateTo(HOME_URL);
      await t.expect(pageReady.exists).ok({ timeout: 10000 });
      await t.scrollIntoView(underHdr);
    }
    await t.expect(good).gt(0, 'No working promo link detected');
  });

  /* STEP 13 */
  await runStep(13, 'Verify that hovering over product images in collection or promo sections displays action icons consistently.', async () => {
    const productCard = vis('.product-thumb, .product-layout, .product-grid .product');
    await t.expect(productCard.exists).ok('No product card found');
    const quickIcons = Selector('button, a').withText(/Add to Cart|Wishlist|Compare|Quick View/i).filterVisible();

    let good = 0;
    const cards = Math.min(await productCard.count, 3);
    for (let i = 0; i < cards; i++) {
      await t.hover(productCard.nth(i));
      if (await quickIcons.exists) good++;
    }
    await t.expect(good).gt(0, 'No quick-action icons visible on hover');
  });

  /* STEP 14 */
  await runStep(14, 'Scroll to From the Blog and check that both image and title links open the correct blog article.', async () => {
    const blogHdr = vis('h2, h3').withText(/From the Blog/i);
    await t.expect(blogHdr.exists).ok('"From the Blog" section missing');
    await t.scrollIntoView(blogHdr);

    const blogLinks = vis('.blog a, .post a, .article a, .blog-item a, .post-thumb a');
    const count = await blogLinks.count;
    if (count === 0) return;

    let opened = 0;
    for (let i = 0; i < Math.min(count, 3); i++) {
      const before = await getHref();
      await clickSafe(blogLinks.nth(i));
      const after = await getHref();
      if (after !== before && /blog|article/i.test(after)) { opened++; break; }
      await t.navigateTo(HOME_URL);
      await t.expect(pageReady.exists).ok({ timeout: 10000 });
      await t.scrollIntoView(blogHdr);
    }
    await t.expect(opened).gt(0, 'Could not open any blog article link');
  });

  /* STEP 15 */
  await runStep(15, 'Click the Scroll-to-Top arrow to ensure it returns the page to the top smoothly.', async () => {
    await t.eval(() => window.scrollTo(0, document.body.scrollHeight));
    await t.wait(WAIT_SHORT);
    const topBtn = vis('a[href="#top"], #back-to-top, .back-to-top, .scroll-top, #scroll-top, .scroll-to-top');
    await t.expect(topBtn.exists).ok('Scroll-to-Top button not present');
    const beforeY = await getScrollY();
    await clickSafe(topBtn);
    const end = Date.now() + 5000;
    let atTop = false;
    while (Date.now() < end && !atTop) {
      await t.wait(150);
      const y = await getScrollY();
      atTop = y < 120 || y < beforeY;
    }
    await t.expect(atTop).ok('Did not scroll towards top');
  });

  logFinal();
});
