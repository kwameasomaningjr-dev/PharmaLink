/**
 * PharmaLink - Frontend Single Page Application Engine
 * Connects to /v1 API Endpoints
 * Reference design: Drugnelly (https://drugnelly.com/)
 */

const App = {
  activePortal: 'customer', // 'customer' | 'pharmacy'
  activePharmacyTab: 'orders',
  fulfillmentFilter: 'ALL', // 'ALL' | 'PICKUP' | 'DELIVERY'
  rxFilter: 'ALL', // 'ALL' | 'OTC' | 'RX'
  activeCategory: null,
  
  tokens: {
    customer: null,
    pharmacy: null,
  },
  users: {
    customer: null,
    pharmacy: null,
  },

  cart: {
    pharmacyId: null,
    pharmacyName: null,
    fulfillmentType: 'PICKUP',
    items: [],
    customerNote: '',
    deliveryAddress: '',
    rxUploaded: false,
  },

  currentUser: null,
  currentToken: null,
  searchResultsCache: [],

  async init() {
    this.showToast('Welcome to PharmaLink Accra - Verified Medicine Availability', 'info');

    // 1. Authenticate default customer (Kwame) & pharmacy admin (Akua)
    await this.authenticateDefaultUsers();

    // 2. Load catalog medicines for inventory modal dropdowns
    await this.loadMedicinesCatalog();

    // 3. Perform initial search for Paracetamol
    await this.searchQuery('Paracetamol');
  },

  async authenticateDefaultUsers() {
    try {
      // Login Customer Kwame by default
      const custRes = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'kwame.customer@gmail.com', password: 'Password123!' })
      });
      const custData = await custRes.json();
      if (custData.success) {
        this.tokens.customer = custData.data.token;
        this.users.customer = custData.data.user;
        this.currentUser = custData.data.user;
        this.currentToken = custData.data.token;
        this.updateUserNavUI();
      }

      // Preload East Legon Pharmacist Akua token for instant pharmacy testing
      const pharmRes = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin@eastlegonrx.gh', password: 'Password123!' })
      });
      const pharmData = await pharmRes.json();
      if (pharmData.success) {
        this.tokens.pharmacy = pharmData.data.token;
        this.users.pharmacy = pharmData.data.user;
      }
    } catch (err) {
      console.error('Failed to authenticate default session users:', err);
    }
  },

  // ========================================================
  // AUTHENTICATION & ACCOUNT REGISTRATION FLOW
  // ========================================================
  openLoginModal(targetRole) {
    this.closeModals();
    if (targetRole === 'PHARMACY') {
      const idInput = document.getElementById('loginIdentifier');
      if (idInput) idInput.value = 'admin@eastlegonrx.gh';
    } else if (targetRole === 'CUSTOMER') {
      const idInput = document.getElementById('loginIdentifier');
      if (idInput) idInput.value = 'kwame.customer@gmail.com';
    }
    document.getElementById('loginModal').classList.add('open');
  },

  openRegisterModal() {
    this.closeModals();
    this.resetRegisterSteps();
    document.getElementById('registerModal').classList.add('open');
  },

  resetRegisterSteps() {
    document.getElementById('registerStepAccountType').style.display = 'block';
    document.getElementById('registerFormPatient').style.display = 'none';
    document.getElementById('registerFormPharmacy').style.display = 'none';
  },

  selectRegisterRole(role) {
    document.getElementById('registerStepAccountType').style.display = 'none';
    if (role === 'CUSTOMER') {
      document.getElementById('registerFormPatient').style.display = 'block';
    } else {
      document.getElementById('registerFormPharmacy').style.display = 'block';
    }
  },

  async handlePatientRegister() {
    const firstName = document.getElementById('regPatFirstName')?.value?.trim();
    const lastName = document.getElementById('regPatLastName')?.value?.trim();
    const email = document.getElementById('regPatEmail')?.value?.trim();
    const phone = document.getElementById('regPatPhone')?.value?.trim();
    const password = document.getElementById('regPatPassword')?.value;

    if (!firstName || !email || !phone || !password) {
      this.showToast('Please fill in all required fields.', 'error');
      return;
    }

    const btn = document.getElementById('btnSubmitPatReg');
    if (btn) { btn.disabled = true; btn.innerText = 'Creating Patient Account...'; }

    try {
      const res = await fetch('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          password,
          role: 'CUSTOMER'
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Registration failed');

      this.currentUser = data.data.user;
      this.currentToken = data.data.token;
      this.tokens.customer = data.data.token;
      this.users.customer = data.data.user;

      this.updateUserNavUI();
      this.closeModals();
      this.switchPortal('customer');
      this.showToast(`Account created! Welcome to PharmaLink, ${firstName}!`, 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '✓ Create Patient Account'; }
    }
  },

  async handlePharmacyRegister() {
    const displayName = document.getElementById('regPharmDisplayName')?.value?.trim();
    const licenseNumber = document.getElementById('regPharmLicense')?.value?.trim();
    const addressLine = document.getElementById('regPharmAddress')?.value?.trim();
    const area = document.getElementById('regPharmArea')?.value;
    const firstName = document.getElementById('regPharmFirstName')?.value?.trim();
    const lastName = document.getElementById('regPharmLastName')?.value?.trim();
    const email = document.getElementById('regPharmEmail')?.value?.trim();
    const phone = document.getElementById('regPharmPhone')?.value?.trim();
    const password = document.getElementById('regPharmPassword')?.value;

    if (!displayName || !addressLine || !firstName || !email || !phone || !password) {
      this.showToast('Please fill in all required pharmacy & pharmacist fields.', 'error');
      return;
    }

    const btn = document.getElementById('btnSubmitPharmReg');
    if (btn) { btn.disabled = true; btn.innerText = 'Registering Pharmacy & Opening Portal...'; }

    try {
      // 1. Register User as PHARMACY_ADMIN
      const userRes = await fetch('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          password,
          role: 'PHARMACY_ADMIN'
        })
      });
      const userData = await userRes.json();
      if (!userData.success) throw new Error(userData.error?.message || 'Pharmacist account registration failed');

      const userToken = userData.data.token;

      // Map area coordinates in Accra
      const areaCoords = {
        'East Legon': { lat: 5.6358, lng: -0.1584 },
        'Osu': { lat: 5.5560, lng: -0.1821 },
        'Airport Residential': { lat: 5.6037, lng: -0.1870 },
        'Spintex': { lat: 5.6231, lng: -0.1025 },
        'Cantonments': { lat: 5.5721, lng: -0.1650 },
        'Labone': { lat: 5.5612, lng: -0.1530 }
      }[area] || { lat: 5.6037, lng: -0.1870 };

      // 2. Create Pharmacy
      const pharmRes = await fetch('/v1/pharmacies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          legal_name: `${displayName} Ltd`,
          display_name: displayName,
          license_number: licenseNumber || `FDA-PH-2024-${Math.floor(1000 + Math.random() * 9000)}`,
          address_line: addressLine,
          city: 'Accra',
          region: 'Greater Accra',
          latitude: areaCoords.lat,
          longitude: areaCoords.lng,
          phone,
          email,
          fulfillment_options: { pickup: true, delivery: true, delivery_base_fee_minor: 2000, delivery_radius_km: 10, response_window_minutes: 15 }
        })
      });

      const pharmData = await pharmRes.json();
      if (!pharmData.success) throw new Error(pharmData.error?.message || 'Pharmacy onboarding failed');

      // Login again to refresh JWT with pharmacy_id claims
      const loginRes = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email, password })
      });
      const loginData = await loginRes.json();

      this.currentUser = loginData.data.user;
      this.currentToken = loginData.data.token;
      this.tokens.pharmacy = loginData.data.token;
      this.users.pharmacy = loginData.data.user;

      this.updateUserNavUI();
      this.closeModals();
      this.switchPortal('pharmacy');
      this.showToast(`Pharmacy "${displayName}" registered! Welcome, Pharmacist ${firstName}!`, 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '✓ Register Pharmacy & Open Portal'; }
    }
  },

  openUserMenuModal() {
    if (!this.currentUser) {
      this.openLoginModal();
      return;
    }

    document.getElementById('menuUserName').innerText = `${this.currentUser.first_name} ${this.currentUser.last_name || ''}`;
    document.getElementById('menuUserEmail').innerText = this.currentUser.email || this.currentUser.phone || '';
    
    const rolePill = document.getElementById('menuUserRolePill');
    const isPharm = this.currentUser.role === 'PHARMACY_ADMIN' || this.currentUser.role === 'PHARMACY_STAFF';
    rolePill.innerText = isPharm ? `PHARMACY (${this.currentUser.pharmacy_name || 'Dispensary'})` : 'PATIENT';
    rolePill.className = `badge ${isPharm ? 'badge-verified' : 'badge-likely'}`;

    const switchBtn = document.getElementById('btnMenuSwitchPortal');
    if (switchBtn) {
      switchBtn.innerText = this.activePortal === 'customer'
        ? '🏥 Switch to Pharmacy Operations Portal'
        : '👤 Switch to Patient Medicine Search';
    }

    document.getElementById('userMenuModal').classList.add('open');
  },

  togglePortalFromMenu() {
    if (this.activePortal === 'customer') {
      if (this.currentUser?.role === 'PHARMACY_ADMIN' || this.currentUser?.role === 'PHARMACY_STAFF' || this.tokens.pharmacy) {
        this.switchPortal('pharmacy');
      } else {
        this.showToast('You are signed in as a Patient. To access a Pharmacy Operations Portal, please sign in with a Pharmacy account or create one!', 'info');
        this.openRegisterModal();
      }
    } else {
      this.switchPortal('customer');
    }
  },

  updateUserNavUI() {
    const guestNav = document.getElementById('guestAuthNavGroup');
    const loggedNav = document.getElementById('userLoggedInNavGroup');
    const label = document.getElementById('userAccountLabel');
    const avatar = document.getElementById('userAvatarIcon');

    if (this.currentUser) {
      if (guestNav) guestNav.style.display = 'none';
      if (loggedNav) loggedNav.style.display = 'flex';

      const isPharm = this.currentUser.role === 'PHARMACY_ADMIN' || this.currentUser.role === 'PHARMACY_STAFF';
      if (avatar) avatar.innerText = isPharm ? '🏥' : '👤';
      if (label) label.innerText = `${this.currentUser.first_name} (${isPharm ? 'Pharmacy' : 'Patient'})`;
    } else {
      if (guestNav) guestNav.style.display = 'flex';
      if (loggedNav) loggedNav.style.display = 'none';
    }
  },

  async quickLogin(identifier, password) {
    document.getElementById('loginIdentifier').value = identifier;
    document.getElementById('loginPassword').value = password;
    await this.handleManualLogin();
  },

  async handleManualLogin() {
    const identifier = document.getElementById('loginIdentifier')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;

    if (!identifier || !password) {
      this.showToast('Please enter your email or phone and password.', 'error');
      return;
    }

    const btn = document.getElementById('btnSubmitLogin');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Signing In...';
    }

    try {
      const res = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Invalid credentials');
      }

      this.currentUser = data.data.user;
      this.currentToken = data.data.token;

      if (this.currentUser.role === 'CUSTOMER') {
        this.tokens.customer = data.data.token;
        this.users.customer = data.data.user;
        this.updateUserNavUI();
        this.closeModals();
        this.switchPortal('customer');
        this.showToast(`Signed in as ${this.currentUser.first_name} (Patient)`, 'success');
      } else if (this.currentUser.role === 'PHARMACY_ADMIN' || this.currentUser.role === 'PHARMACY_STAFF') {
        this.tokens.pharmacy = data.data.token;
        this.users.pharmacy = data.data.user;
        this.updateUserNavUI();
        this.closeModals();
        this.switchPortal('pharmacy');
        this.showToast(`Signed in to Pharmacy Portal as ${this.currentUser.first_name}`, 'success');
      } else {
        this.updateUserNavUI();
        this.closeModals();
        this.showToast(`Signed in as ${this.currentUser.first_name} (${this.currentUser.role})`, 'success');
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Sign In';
      }
    }
  },

  logoutUser() {
    this.currentUser = null;
    this.currentToken = null;
    this.tokens.customer = null;
    this.tokens.pharmacy = null;
    this.updateUserNavUI();
    this.closeModals();
    this.switchPortal('customer');
    this.showToast('You have been signed out of PharmaLink.', 'info');
  },

  navigateToLanding() {
    this.switchPortal('customer');
    const input = document.getElementById('mainSearchInput');
    if (input) input.value = '';
    this.doSearch();
  },

  async loadMedicinesCatalog() {
    try {
      const res = await fetch('/v1/medicines?limit=50');
      const data = await res.json();
      if (data.success) {
        this.medicinesList = data.data;
        this.populateMedicineSelect();
      }
    } catch (err) {
      console.error('Failed to load medicines:', err);
    }
  },

  populateMedicineSelect() {
    const sel = document.getElementById('shelfMedicineSelect');
    if (!sel) return;
    sel.innerHTML = (this.medicinesList || [])
      .map(m => `<option value="${m.id}">${m.generic_name} ${m.strength_value || ''}${m.strength_unit || ''} (${m.formulation})</option>`)
      .join('');
  },

  // ========================================================
  // PORTAL SWITCHING
  // ========================================================
  switchPortal(portal) {
    this.activePortal = portal;
    const custView = document.getElementById('customerView');
    const pharmView = document.getElementById('pharmacyView');
    const cartBtn = document.getElementById('btnOpenCart');
    const locPill = document.getElementById('locationContainer');
    const trackBtn = document.getElementById('btnTrackOrders');

    if (portal === 'customer') {
      custView.style.display = 'block';
      pharmView.style.display = 'none';
      cartBtn.style.display = 'flex';
      locPill.style.display = 'flex';
      if (trackBtn) trackBtn.style.display = 'flex';
    } else {
      custView.style.display = 'none';
      pharmView.style.display = 'block';
      cartBtn.style.display = 'none';
      locPill.style.display = 'none';
      if (trackBtn) trackBtn.style.display = 'none';

      // Set Pharmacy Title in Portal
      const nameEl = document.getElementById('portalPharmacyName');
      const subEl = document.getElementById('portalPharmacyDetails');
      if (this.currentUser?.pharmacy_name) {
        if (nameEl) nameEl.innerText = this.currentUser.pharmacy_name;
        if (subEl) subEl.innerText = `Accra Dispensary • Pharmacist ${this.currentUser.first_name} ${this.currentUser.last_name || ''}`;
      }

      this.refreshPharmacyPortal();
    }
  },

  // ========================================================
  // CUSTOMER SEARCH & CATEGORY FILTERING
  // ========================================================
  getUserCoords() {
    const sel = document.getElementById('userLocationSelect');
    const [lat, lng] = (sel?.value || '5.6358,-0.1584').split(',').map(Number);
    return { lat, lng };
  },

  onLocationChange() {
    this.doSearch();
  },

  searchQuery(q) {
    const input = document.getElementById('mainSearchInput');
    if (input) input.value = q;
    this.activeCategory = null;
    this.doSearch();
  },

  filterByCategory(categoryKey) {
    const queries = {
      PAIN: 'Paracetamol',
      ANTIBIOTICS: 'Amoxicillin',
      MALARIA: 'Coartem',
      CHRONIC: 'Metformin',
      ALLERGY: 'Cetirizine',
      VITAMINS: 'Vitamin',
      FIRSTAID: 'Antiseptic',
      BABY: 'Folic'
    };

    const q = queries[categoryKey] || '';
    const input = document.getElementById('mainSearchInput');
    if (input) input.value = q;
    this.activeCategory = categoryKey;
    this.doSearch();
  },

  setFulfillmentFilter(type) {
    this.fulfillmentFilter = type;
    document.getElementById('chipAll')?.classList.toggle('active', type === 'ALL');
    document.getElementById('chipPickup')?.classList.toggle('active', type === 'PICKUP');
    document.getElementById('chipDelivery')?.classList.toggle('active', type === 'DELIVERY');
    this.renderSearchResults(this.applyClientFilters(this.searchResultsCache));
  },

  setRxFilter(type) {
    this.rxFilter = this.rxFilter === type ? 'ALL' : type;
    document.getElementById('chipOtc')?.classList.toggle('active', this.rxFilter === 'OTC');
    document.getElementById('chipRx')?.classList.toggle('active', this.rxFilter === 'RX');
    this.renderSearchResults(this.applyClientFilters(this.searchResultsCache));
  },

  applyClientFilters(results) {
    let filtered = [...results];
    if (this.fulfillmentFilter === 'PICKUP') {
      filtered = filtered.filter(i => i.fulfillment?.pickup);
    } else if (this.fulfillmentFilter === 'DELIVERY') {
      filtered = filtered.filter(i => i.fulfillment?.delivery);
    }

    if (this.rxFilter === 'OTC') {
      filtered = filtered.filter(i => !i.medicine?.prescription_required);
    } else if (this.rxFilter === 'RX') {
      filtered = filtered.filter(i => i.medicine?.prescription_required);
    }

    return filtered;
  },

  async doSearch() {
    const q = document.getElementById('mainSearchInput')?.value?.trim() || '';
    const { lat, lng } = this.getUserCoords();
    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
        <div class="spinner"></div>
        <p style="margin-top: 1rem; font-weight: 500;">Scanning verified pharmacy inventories in Accra...</p>
      </div>
    `;

    let url = `/v1/medicines/search?q=${encodeURIComponent(q)}&latitude=${lat}&longitude=${lng}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success || !data.data || data.data.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1.5rem; background: white; border-radius: var(--radius-lg); border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
            <div style="font-size: 3rem; margin-bottom: 0.75rem;">🔍</div>
            <h3 style="font-family: var(--font-display); margin-bottom: 0.5rem; font-size: 1.25rem;">No verified pharmacies found for "${q}"</h3>
            <p style="color: var(--text-muted); font-size: 0.95rem; max-width: 460px; margin: 0 auto 1.5rem;">
              Try searching for common Accra medicines like <strong>Paracetamol</strong>, <strong>Panadol</strong>, <strong>Amoxicillin</strong>, <strong>Coartem</strong>, or switch your Accra location above.
            </p>
            <button class="btn-action-primary" onclick="App.searchQuery('Paracetamol')">Search Paracetamol</button>
          </div>
        `;
        document.getElementById('resultCountLabel').innerText = '0 pharmacies found';
        this.searchResultsCache = [];
        return;
      }

      this.searchResultsCache = data.data;
      const filtered = this.applyClientFilters(data.data);
      document.getElementById('resultCountLabel').innerText = `${filtered.length} verified pharmacy offer(s)`;
      this.renderSearchResults(filtered);
    } catch (err) {
      grid.innerHTML = `<div style="grid-column: 1/-1; color: #dc2626; padding: 2rem; background: white; border-radius: var(--radius-md);">Error fetching availability: ${err.message}</div>`;
    }
  },

  renderSearchResults(results) {
    const grid = document.getElementById('resultsGrid');
    if (results.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: white; border-radius: var(--radius-md);">
          <p style="color: var(--text-muted);">No items match your selected filter criteria.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = results.map(item => {
      const stateBadgeClass = {
        VERIFIED: 'badge-verified',
        LIKELY: 'badge-likely',
        UNCERTAIN: 'badge-uncertain',
        UNAVAILABLE: 'badge-unavailable'
      }[item.availability_state] || 'badge-uncertain';

      const stateIcon = {
        VERIFIED: '✓ VERIFIED IN STOCK',
        LIKELY: '• LIKELY IN STOCK',
        UNCERTAIN: '? UNCERTAIN',
        UNAVAILABLE: '✕ OUT OF STOCK'
      }[item.availability_state];

      const distLabel = item.distance_km !== null ? `${item.distance_km} km away` : 'Accra';
      const rxBadge = item.medicine.prescription_required
        ? '<span class="badge badge-rx">📋 Rx Required</span>'
        : '<span class="badge badge-otc">🟢 OTC</span>';

      const medCategory = this.inferCategoryName(item.medicine.generic_name);

      return `
        <div class="result-card">
          <div class="card-body-wrapper">
            <!-- Header Badges -->
            <div class="card-top-header">
              <span class="category-pill-sm">${medCategory}</span>
              <div class="badges-row">
                <span class="badge ${stateBadgeClass}">
                  ${item.availability_state === 'VERIFIED' ? '<span class="pulse-dot"></span>' : ''}
                  ${stateIcon}
                </span>
                ${rxBadge}
              </div>
            </div>

            <!-- Medicine Title & Formulation -->
            <div class="med-title-group">
              <h3 class="med-generic-title" onclick='App.openDrugDetailsModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'>
                ${item.medicine.generic_name}
              </h3>
              <div class="med-strength-sub">
                ${item.medicine.brand_name ? `Brand: <strong>${item.medicine.brand_name}</strong> • ` : ''}
                ${item.medicine.strength_value || ''}${item.medicine.strength_unit || ''} ${item.medicine.formulation}
              </div>
            </div>

            <!-- Freshness Label -->
            <div class="freshness-tag">
              <span>🕒 ${item.freshness || 'Recently updated stock'}</span>
            </div>

            <!-- Pharmacy details strip -->
            <div class="pharmacy-strip">
              <div class="pharmacy-name-row">
                <span class="pharmacy-display-name">🏥 ${item.pharmacy.display_name}</span>
                <span class="pharmacy-dist-pill">📍 ${distLabel}</span>
              </div>
              <div class="pharmacy-address-sub">${item.pharmacy.address_line}, ${item.pharmacy.city}</div>
              <div class="fulfillment-pills">
                ${item.fulfillment.pickup ? '<span class="fulfillment-pill">🚶 Pickup</span>' : ''}
                ${item.fulfillment.delivery ? '<span class="fulfillment-pill">🛵 Delivery</span>' : ''}
                <span class="fulfillment-pill">📞 ${item.pharmacy.phone}</span>
              </div>
            </div>
          </div>

          <!-- Bottom Action & Pricing -->
          <div class="card-bottom-footer">
            <div class="price-block">
              <span class="price-sub">Unit Price</span>
              <span class="price-val">${item.price.formatted}</span>
            </div>

            <div class="action-btn-group">
              <button 
                class="btn-info-icon" 
                title="View Drug Information"
                onclick='App.openDrugDetailsModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'
              >
                ℹ️ Info
              </button>
              <button
                class="btn-add"
                ${item.availability_state === 'UNAVAILABLE' ? 'disabled' : ''}
                onclick='App.addToCart(${JSON.stringify(item).replace(/'/g, "&#39;")})'
              >
                + Add to Order
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  inferCategoryName(genericName = '') {
    const name = genericName.toLowerCase();
    if (name.includes('paracetamol') || name.includes('panadol') || name.includes('ibuprofen') || name.includes('diclofenac')) return 'Pain & Fever';
    if (name.includes('amoxicillin') || name.includes('azithromycin') || name.includes('ciprofloxacin')) return 'Antibiotics';
    if (name.includes('coartem') || name.includes('lonart') || name.includes('artemether')) return 'Malaria Care';
    if (name.includes('metformin') || name.includes('amlodipine') || name.includes('lisinopril')) return 'Chronic Care';
    if (name.includes('cetirizine') || name.includes('loratadine') || name.includes('salbutamol')) return 'Allergy & Respiratory';
    if (name.includes('vitamin') || name.includes('zinc') || name.includes('multivitamin')) return 'Vitamins';
    if (name.includes('antiseptic') || name.includes('hydrocortisone') || name.includes('bandage')) return 'First Aid';
    if (name.includes('folic') || name.includes('calpol')) return 'Baby & Maternal';
    return 'General Medicine';
  },

  // ========================================================
  // DRUG DETAILS MODAL
  // ========================================================
  openDrugDetailsModal(item) {
    const med = item.medicine;
    const cat = this.inferCategoryName(med.generic_name);

    document.getElementById('drugModalCategoryPill').innerText = cat;
    document.getElementById('drugModalTitle').innerText = `${med.generic_name} ${med.strength_value || ''}${med.strength_unit || ''}`;
    document.getElementById('drugModalSub').innerText = med.brand_name ? `Common Brand Name: ${med.brand_name}` : 'Generic Formula';

    document.getElementById('drugModalGeneric').innerText = med.generic_name;
    document.getElementById('drugModalStrength').innerText = `${med.strength_value || ''}${med.strength_unit || ''} ${med.formulation}`;
    document.getElementById('drugModalRxStatus').innerText = med.prescription_required
      ? '📋 Prescription Required (Rx)'
      : '🟢 Over The Counter (OTC)';

    const descMap = {
      'Paracetamol': 'Used for effective relief from mild to moderate pain, headaches, muscle aches, and fever reduction.',
      'Amoxicillin': 'Broad-spectrum penicillin antibiotic used to treat bacterial infections of the chest, ears, throat, and urinary tract.',
      'Coartem': 'First-line Artemisinin-based Combination Therapy (ACT) for uncomplicated Plasmodium falciparum malaria in Ghana.',
      'Ibuprofen': 'Non-steroidal anti-inflammatory drug (NSAID) used to relieve pain, swelling, and fever.',
      'Cetirizine': 'Antihistamine used to relieve allergy symptoms such as sneezing, runny nose, itching, and watery eyes.',
      'Metformin': 'First-line medication for the treatment of type 2 diabetes, helping lower blood glucose levels.',
    };

    const desc = descMap[med.generic_name] || `Standard formulation of ${med.generic_name} (${med.formulation}). Indicated for general pharmaceutical treatment according to doctor's dosage guidelines.`;
    document.getElementById('drugModalDescription').innerText = desc;

    const sameMedMatches = this.searchResultsCache.filter(r => r.medicine.id === med.id);
    const pharmListEl = document.getElementById('drugModalPharmaciesList');

    if (sameMedMatches.length === 0) {
      pharmListEl.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No other Accra pharmacies currently listing this item.</p>';
    } else {
      pharmListEl.innerHTML = sameMedMatches.map(m => `
        <div class="modal-pharmacy-item">
          <div>
            <div style="font-weight: 700; color: var(--text-main);">🏥 ${m.pharmacy.display_name}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${m.pharmacy.address_line}, ${m.pharmacy.city} • 📍 ${m.distance_km} km away</div>
            <div style="margin-top: 0.25rem;">
              <span class="badge ${m.availability_state === 'VERIFIED' ? 'badge-verified' : 'badge-likely'}">${m.availability_state}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem;">${m.freshness}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary-dark);">${m.price.formatted}</div>
            <button 
              class="btn-action-sm btn-accept" 
              style="margin-top: 0.4rem;"
              onclick='App.closeModals(); App.addToCart(${JSON.stringify(m).replace(/'/g, "&#39;")});'
            >
              + Order Here
            </button>
          </div>
        </div>
      `).join('');
    }

    document.getElementById('drugDetailsModal').classList.add('open');
  },

  // ========================================================
  // CART & CHECKOUT WORKFLOW
  // ========================================================
  addToCart(searchItem) {
    if (this.cart.pharmacyId && this.cart.pharmacyId !== searchItem.pharmacy.id) {
      if (!confirm(`Your cart already contains items from ${this.cart.pharmacyName}. Clear cart and switch to ${searchItem.pharmacy.display_name}?`)) {
        return;
      }
      this.cart.items = [];
    }

    this.cart.pharmacyId = searchItem.pharmacy.id;
    this.cart.pharmacyName = searchItem.pharmacy.display_name;

    const existing = this.cart.items.find(i => i.medicine_id === searchItem.medicine.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.items.push({
        medicine_id: searchItem.medicine.id,
        generic_name: searchItem.medicine.generic_name,
        brand_name: searchItem.medicine.brand_name,
        strength: `${searchItem.medicine.strength_value || ''}${searchItem.medicine.strength_unit || ''}`,
        formulation: searchItem.medicine.formulation,
        unit_price_minor: searchItem.price.unit_price_minor,
        prescription_required: searchItem.medicine.prescription_required,
        quantity: 1,
      });
    }

    this.updateCartBadge();
    this.showToast(`Added ${searchItem.medicine.generic_name} to cart!`, 'success');
  },

  updateCartBadge() {
    const totalCount = this.cart.items.reduce((acc, item) => acc + item.quantity, 0);
    const badge = document.getElementById('cartCount');
    if (badge) badge.innerText = totalCount;
  },

  openCartModal() {
    if (this.cart.items.length === 0) {
      this.showToast('Your cart is empty. Add a medicine from the search results!', 'info');
      return;
    }

    this.renderCartItems();
    document.getElementById('cartModal').classList.add('open');
  },

  setCheckoutFulfillment(type) {
    this.cart.fulfillmentType = type;
    document.getElementById('btnSelectPickup')?.classList.toggle('active', type === 'PICKUP');
    document.getElementById('btnSelectDelivery')?.classList.toggle('active', type === 'DELIVERY');
    document.getElementById('deliveryAddressGroup').style.display = type === 'DELIVERY' ? 'block' : 'none';
    this.renderCartItems();
  },

  renderCartItems() {
    const container = document.getElementById('cartItemsList');
    let subtotalMinor = 0;
    let hasRx = false;

    container.innerHTML = this.cart.items.map((item, idx) => {
      const lineTotal = item.unit_price_minor * item.quantity;
      subtotalMinor += lineTotal;
      if (item.prescription_required) hasRx = true;

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border);">
          <div>
            <div style="font-weight: 700; color: var(--text-main);">${item.generic_name} ${item.strength}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${item.formulation} • GHS ${(item.unit_price_minor / 100).toFixed(2)} each</div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="btn-action-sm" onclick="App.changeCartQty(${idx}, -1)">-</button>
            <span style="font-weight: 700; min-width: 20px; text-align: center;">${item.quantity}</span>
            <button class="btn-action-sm" onclick="App.changeCartQty(${idx}, 1)">+</button>
            <span style="font-weight: 700; margin-left: 0.75rem; min-width: 70px; text-align: right; color: var(--primary-dark);">GHS ${(lineTotal / 100).toFixed(2)}</span>
          </div>
        </div>
      `;
    }).join('');

    const deliveryFeeMinor = this.cart.fulfillmentType === 'DELIVERY' ? 2000 : 0;
    const totalMinor = subtotalMinor + deliveryFeeMinor;

    document.getElementById('checkoutSubtotal').innerText = `GHS ${(subtotalMinor / 100).toFixed(2)}`;
    document.getElementById('checkoutDeliveryFee').innerText = `GHS ${(deliveryFeeMinor / 100).toFixed(2)}`;
    document.getElementById('checkoutTotal').innerText = `GHS ${(totalMinor / 100).toFixed(2)}`;

    document.getElementById('rxUploadSection').style.display = hasRx ? 'block' : 'none';
  },

  changeCartQty(idx, delta) {
    this.cart.items[idx].quantity += delta;
    if (this.cart.items[idx].quantity <= 0) {
      this.cart.items.splice(idx, 1);
    }
    if (this.cart.items.length === 0) {
      this.closeModals();
    } else {
      this.renderCartItems();
    }
    this.updateCartBadge();
  },

  onRxFileSelected(e) {
    const file = e.target.files?.[0];
    if (file) {
      this.cart.rxUploaded = true;
      document.getElementById('rxUploadPreview').innerText = `✓ File attached: ${file.name} (Ready for pharmacist review)`;
    }
  },

  async submitCustomerOrder() {
    const hasRx = this.cart.items.some(i => i.prescription_required);
    if (hasRx && !this.cart.rxUploaded) {
      this.showToast('Please attach your doctor prescription before placing this order.', 'error');
      return;
    }

    if (!this.tokens.customer) {
      this.showToast('Please sign in or create an account to place an order.', 'info');
      this.openLoginModal();
      return;
    }

    const payload = {
      pharmacy_id: this.cart.pharmacyId,
      fulfillment_type: this.cart.fulfillmentType,
      items: this.cart.items.map(i => ({ medicine_id: i.medicine_id, quantity: i.quantity })),
      customer_note: document.getElementById('customerNoteInput')?.value || '',
      delivery_address: document.getElementById('deliveryAddressInput')?.value || '',
    };

    const submitBtn = document.getElementById('btnSubmitOrder');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Submitting order...';

    try {
      const res = await fetch('/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tokens.customer}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Order submission failed');
      }

      const order = data.data;

      // If Rx file was attached, create prescription record
      if (hasRx) {
        await fetch('/v1/prescriptions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.tokens.customer}`
          },
          body: JSON.stringify({
            order_id: order.id,
            storage_key: 'prescriptions/rx_upload_sample.jpg'
          })
        });
      }

      this.showToast(`Order ${order.order_number} submitted to ${this.cart.pharmacyName}!`, 'success');

      // Clear cart
      this.cart.items = [];
      this.cart.rxUploaded = false;
      this.updateCartBadge();
      this.closeModals();

      // Open Tracker
      this.openOrderTracker(order.id);
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = '✓ Confirm & Submit Order';
    }
  },

  // ========================================================
  // CUSTOMER MY ORDERS & TRACKER WORKFLOW
  // ========================================================
  async openCustomerOrdersListModal() {
    if (!this.tokens.customer) {
      this.openLoginModal();
      return;
    }

    const container = document.getElementById('customerOrdersList');
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">Fetching your orders...</p>';
    document.getElementById('customerOrdersModal').classList.add('open');

    try {
      const res = await fetch('/v1/orders', {
        headers: { 'Authorization': `Bearer ${this.tokens.customer}` }
      });
      const data = await res.json();
      if (!data.success || !data.data || data.data.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 3rem;">
            <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main);">No active orders found</p>
            <p style="color: var(--text-muted); font-size: 0.9rem;">Search for a medicine and submit an order to track it live!</p>
          </div>
        `;
        return;
      }

      container.innerHTML = data.data.map(o => `
        <div class="customer-order-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <div>
              <div style="font-weight: 800; font-size: 1.05rem; color: var(--text-main);">${o.order_number}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">🏥 ${o.pharmacy?.display_name || 'Accra Pharmacy'} • ${new Date(o.created_at).toLocaleTimeString()}</div>
            </div>
            <span class="badge ${o.status === 'ACCEPTED' ? 'badge-verified' : 'badge-uncertain'}">${o.status}</span>
          </div>

          <div style="font-size: 0.9rem; margin-bottom: 0.75rem;">
            ${o.items?.map(i => `<div>• ${i.quantity}x ${i.display_name}</div>`).join('') || ''}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border); padding-top: 0.5rem;">
            <span style="font-weight: 800; color: var(--primary-dark);">Total: GHS ${(o.total_minor / 100).toFixed(2)}</span>
            <button class="btn-action-sm btn-accept" onclick="App.closeModals(); App.openOrderTracker('${o.id}');">
              Track Live Status ➔
            </button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<p style="color: #dc2626;">Error: ${err.message}</p>`;
    }
  },

  async openOrderTracker(orderId) {
    this.currentTrackingOrderId = orderId;
    document.getElementById('trackerModal').classList.add('open');
    await this.refreshCurrentOrderStatus();
  },

  async refreshCurrentOrderStatus() {
    if (!this.currentTrackingOrderId) return;
    try {
      const res = await fetch(`/v1/orders/${this.currentTrackingOrderId}`, {
        headers: { 'Authorization': `Bearer ${this.tokens.customer}` }
      });
      const data = await res.json();
      if (!data.success) return;

      const order = data.data;
      document.getElementById('trackerOrderNumber').innerText = `Order Ref: ${order.order_number} (${order.status})`;
      document.getElementById('trackerPharmacyInfo').innerText = `🏥 ${order.pharmacy?.display_name || 'Pharmacy'} • Total Payable: GHS ${(order.total_minor / 100).toFixed(2)}`;

      this.updateTrackerPipeline(order.status);

      // Render items
      document.getElementById('trackerOrderItems').innerHTML = order.items.map(item => `
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.25rem;">
          <span>${item.quantity}x ${item.display_name}</span>
          <span style="font-weight: 600; color: var(--text-main);">GHS ${(item.line_total_minor / 100).toFixed(2)}</span>
        </div>
      `).join('');

      document.getElementById('btnCancelOrder').style.display = ['PENDING', 'ACCEPTED'].includes(order.status) ? 'block' : 'none';
    } catch (err) {
      console.error('Failed to refresh order status:', err);
    }
  },

  updateTrackerPipeline(status) {
    const statusMap = {
      PENDING: 1,
      ACCEPTED: 2,
      PROCESSING: 3,
      READY: 4,
      OUT_FOR_DELIVERY: 4,
      COMPLETED: 5,
      CANCELLED: 0,
      REJECTED: 0,
      EXPIRED: 0
    };

    const currentStep = statusMap[status] || 1;

    ['Pending', 'Accepted', 'Processing', 'Ready', 'Completed'].forEach((name, idx) => {
      const el = document.getElementById(`step${name}`);
      if (!el) return;
      el.classList.remove('active', 'completed');
      if (idx + 1 < currentStep) el.classList.add('completed');
      if (idx + 1 === currentStep) el.classList.add('active');
    });

    const noticeTitle = document.getElementById('trackerNoticeTitle');
    const noticeDesc = document.getElementById('trackerNoticeDesc');

    if (status === 'PENDING') {
      noticeTitle.innerText = '1. Submitted — Waiting for Pharmacy Acceptance';
      noticeDesc.innerText = 'Stock is not locked yet. The pharmacy will verify shelf stock and accept your order shortly.';
    } else if (status === 'ACCEPTED') {
      noticeTitle.innerText = '2. Stock Locked & Order Accepted!';
      noticeDesc.innerText = 'Your medicine has been reserved and stock locked atomically. The pharmacist is assembling your package.';
    } else if (status === 'PROCESSING') {
      noticeTitle.innerText = '3. Order is Being Packaged';
      noticeDesc.innerText = 'Pharmacist is assembling and packaging your order.';
    } else if (status === 'READY') {
      noticeTitle.innerText = '4. Ready for Pickup!';
      noticeDesc.innerText = 'Your medicines are packaged and waiting at the pharmacy front desk.';
    } else if (status === 'OUT_FOR_DELIVERY') {
      noticeTitle.innerText = '4. Dispatched for Accra Delivery';
      noticeDesc.innerText = 'The delivery rider is en route to your address.';
    } else if (status === 'COMPLETED') {
      noticeTitle.innerText = '5. Order Fulfilled & Handed Over';
      noticeDesc.innerText = 'Thank you for using PharmaLink!';
    } else if (status === 'REJECTED') {
      noticeTitle.innerText = 'Order Rejected by Pharmacy';
      noticeDesc.innerText = 'Reservation released. The pharmacy was unable to fulfill this order.';
    } else if (status === 'CANCELLED') {
      noticeTitle.innerText = 'Order Cancelled';
      noticeDesc.innerText = 'This order was cancelled and any held stock reservations have been released.';
    }
  },

  async cancelCurrentOrder() {
    if (!confirm('Are you sure you want to cancel this order? Any stock reserved for you will be released.')) return;
    try {
      const res = await fetch(`/v1/orders/${this.currentTrackingOrderId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.tokens.customer}` }
      });
      const data = await res.json();
      if (data.success) {
        this.showToast('Order cancelled and reservation released.', 'info');
        await this.refreshCurrentOrderStatus();
      }
    } catch (err) {
      this.showToast('Failed to cancel order: ' + err.message, 'error');
    }
  },

  // ========================================================
  // PHARMACY OPERATIONS PORTAL (P01 - P07)
  // ========================================================
  switchPharmacyTab(tab) {
    this.activePharmacyTab = tab;
    ['orders', 'inventory', 'import', 'audit'].forEach(t => {
      const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
      const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
      if (btn) btn.classList.toggle('active', t === tab);
      if (content) content.style.display = t === tab ? 'block' : 'none';
    });

    if (tab === 'orders') this.loadPharmacyOrders();
    if (tab === 'inventory') this.loadPharmacyInventory();
    if (tab === 'audit') this.loadPharmacyAudit();
  },

  async refreshPharmacyPortal() {
    await this.loadPharmacyOrders();
    await this.loadPharmacyInventory();
  },

  async loadPharmacyOrders() {
    try {
      const res = await fetch('/v1/pharmacy/orders', {
        headers: { 'Authorization': `Bearer ${this.tokens.pharmacy}` }
      });
      const data = await res.json();
      if (!data.success) return;

      const orders = data.data;
      const pendingCount = orders.filter(o => o.status === 'PENDING').length;
      document.getElementById('statPendingOrders').innerText = pendingCount;
      document.getElementById('inboxBadge').innerText = pendingCount;

      const tbody = document.getElementById('pharmacyOrdersTableBody');
      if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No orders found in inbox.</td></tr>';
        return;
      }

      tbody.innerHTML = orders.map(o => {
        let actionButtons = '';
        if (o.status === 'PENDING') {
          actionButtons = `
            <button class="btn-action-sm btn-accept" onclick="App.pharmacyAcceptOrder('${o.id}')">✓ Accept</button>
            <button class="btn-action-sm btn-reject" onclick="App.pharmacyRejectOrder('${o.id}')">✕ Reject</button>
          `;
        } else if (o.status === 'ACCEPTED') {
          actionButtons = `
            <button class="btn-action-sm btn-accept" onclick="App.pharmacyAdvanceOrder('${o.id}', 'PROCESSING')">Start Processing</button>
          `;
        } else if (o.status === 'PROCESSING') {
          actionButtons = `
            <button class="btn-action-sm btn-accept" onclick="App.pharmacyAdvanceOrder('${o.id}', 'READY')">Mark Ready</button>
          `;
        } else if (o.status === 'READY') {
          actionButtons = `
            <button class="btn-action-sm btn-accept" onclick="App.pharmacyAdvanceOrder('${o.id}', 'COMPLETED')">Complete Handover</button>
          `;
        } else {
          actionButtons = `<span style="font-size: 0.8rem; color: var(--text-muted);">${o.status}</span>`;
        }

        return `
          <tr>
            <td><strong>${o.order_number}</strong></td>
            <td>${o.customer_name || 'Customer'}<br><small style="color: var(--text-muted);">${o.customer_phone || ''}</small></td>
            <td>${o.items?.length || 1} item(s)</td>
            <td><span class="badge ${o.fulfillment_type === 'DELIVERY' ? 'badge-likely' : 'badge-otc'}">${o.fulfillment_type}</span></td>
            <td><strong>GHS ${(o.total_minor / 100).toFixed(2)}</strong></td>
            <td><span class="badge ${o.status === 'ACCEPTED' ? 'badge-verified' : 'badge-uncertain'}">${o.status}</span></td>
            <td><div style="display: flex; gap: 0.4rem;">${actionButtons}</div></td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load pharmacy orders:', err);
    }
  },

  async pharmacyAcceptOrder(orderId) {
    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.tokens.pharmacy}` }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Could not accept order');
      }
      this.showToast('Order Accepted! Stock reserved atomically.', 'success');
      await this.refreshPharmacyPortal();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async pharmacyRejectOrder(orderId) {
    const reason = prompt('Please enter a rejection reason (e.g. Out of stock / Store closing):', 'Stock depleted on shelf');
    if (!reason) return;

    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tokens.pharmacy}`
        },
        body: JSON.stringify({ rejection_reason: reason })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message);
      this.showToast('Order rejected and customer notified.', 'info');
      await this.refreshPharmacyPortal();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async pharmacyAdvanceOrder(orderId, nextStatus) {
    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tokens.pharmacy}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message);
      this.showToast(`Order advanced to ${nextStatus}`, 'success');
      await this.refreshPharmacyPortal();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async loadPharmacyInventory() {
    try {
      const res = await fetch('/v1/inventory', {
        headers: { 'Authorization': `Bearer ${this.tokens.pharmacy}` }
      });
      const data = await res.json();
      if (!data.success) return;

      const items = data.data;
      document.getElementById('statActiveInventory').innerText = items.length;
      const totalReserved = items.reduce((acc, item) => acc + (item.reserved_quantity || 0), 0);
      document.getElementById('statReservedUnits').innerText = totalReserved;

      const tbody = document.getElementById('pharmacyInventoryTableBody');
      tbody.innerHTML = items.map(i => {
        const stateBadge = {
          VERIFIED: 'badge-verified',
          LIKELY: 'badge-likely',
          UNCERTAIN: 'badge-uncertain',
          UNAVAILABLE: 'badge-unavailable'
        }[i.availability_state] || 'badge-uncertain';

        return `
          <tr>
            <td><strong>${i.generic_name}</strong> ${i.brand_name ? `(${i.brand_name})` : ''}</td>
            <td>${i.strength_value || ''}${i.strength_unit || ''} ${i.formulation}</td>
            <td>${i.observed_quantity} units</td>
            <td style="color: #dc2626; font-weight: 700;">${i.reserved_quantity} locked</td>
            <td style="color: #1a1a1a; font-weight: 700;">${i.available_quantity} available</td>
            <td>GHS ${(i.unit_price_minor / 100).toFixed(2)}</td>
            <td><span class="badge ${stateBadge}">${i.availability_state}</span></td>
            <td><small style="color: var(--text-muted);">${i.freshness_label || 'Today'}</small></td>
            <td>
              <button class="btn-action-sm btn-confirm-stock" onclick="App.openShelfCountForMed('${i.medicine_id}', ${i.observed_quantity}, ${(i.unit_price_minor / 100).toFixed(2)})">
                Count Stock
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load pharmacy inventory:', err);
    }
  },

  openShelfCountModal() {
    document.getElementById('shelfCountModal').classList.add('open');
  },

  openShelfCountForMed(medId, qty, price) {
    document.getElementById('shelfMedicineSelect').value = medId;
    document.getElementById('shelfQuantityInput').value = qty;
    document.getElementById('shelfPriceInput').value = price;
    this.openShelfCountModal();
  },

  async submitShelfConfirmation() {
    const medId = document.getElementById('shelfMedicineSelect').value;
    const qty = Number(document.getElementById('shelfQuantityInput').value);
    const priceGhs = Number(document.getElementById('shelfPriceInput').value);
    const note = document.getElementById('shelfNoteInput').value;

    try {
      const res = await fetch('/v1/inventory/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tokens.pharmacy}`
        },
        body: JSON.stringify({
          medicine_id: medId,
          physical_quantity: qty,
          unit_price_minor: Math.round(priceGhs * 100),
          note
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message);

      this.showToast('Physical shelf count saved! Availability set to VERIFIED.', 'success');
      this.closeModals();
      await this.loadPharmacyInventory();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async executeCsvImport() {
    const csvContent = document.getElementById('csvImportText').value;
    const feedback = document.getElementById('csvFeedback');
    feedback.style.display = 'block';
    feedback.innerHTML = '<p style="color: var(--text-muted);">Validating and processing CSV lines...</p>';

    try {
      const res = await fetch('/v1/inventory/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tokens.pharmacy}`
        },
        body: JSON.stringify({ csv_content: csvContent })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message);

      const d = data.data;
      feedback.innerHTML = `
        <div style="background: ${d.records_rejected > 0 ? '#fffbeb' : '#f5f5f5'}; border: 1px solid ${d.records_rejected > 0 ? '#fde68a' : '#cccccc'}; padding: 1rem; border-radius: var(--radius-md);">
          <h4 style="font-weight: 700; margin-bottom: 0.5rem; color: ${d.records_rejected > 0 ? '#b45309' : '#1a1a1a'};">
            Import Status: ${d.status} (${d.records_accepted} accepted, ${d.records_rejected} flagged)
          </h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
            Successfully parsed ${d.records_received} total rows. Prior valid inventory data was preserved safely.
          </p>
          ${d.errors?.length > 0 ? `
            <div style="font-size: 0.8rem; background: white; padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <strong>Row Errors Reported:</strong>
              <ul style="margin-left: 1.25rem; margin-top: 0.25rem;">
                ${d.errors.map(e => `<li>Row ${e.row}: ${e.reason}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `;

      this.showToast(`Imported ${d.records_accepted} inventory records!`, 'success');
      await this.loadPharmacyInventory();
    } catch (err) {
      feedback.innerHTML = `<p style="color: #dc2626;">Error: ${err.message}</p>`;
    }
  },

  async loadPharmacyAudit() {
    try {
      const res = await fetch('/v1/audit?limit=25', {
        headers: { 'Authorization': `Bearer ${this.tokens.pharmacy}` }
      });
      const data = await res.json();
      if (!data.success) return;

      const tbody = document.getElementById('auditTableBody');
      tbody.innerHTML = data.data.map(e => `
        <tr>
          <td><small style="color: var(--text-muted);">${new Date(e.created_at).toLocaleTimeString()} - ${new Date(e.created_at).toLocaleDateString()}</small></td>
          <td><span class="badge badge-otc">${e.event_type}</span></td>
          <td>${e.entity_type} <small style="color: var(--text-muted);">(${e.entity_id?.substring(0, 8)}...)</small></td>
          <td><small style="font-family: monospace;">${typeof e.metadata === 'object' ? JSON.stringify(e.metadata) : e.metadata}</small></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load audit events:', err);
    }
  },

  // ========================================================
  // UTILITIES & TOASTS
  // ========================================================
  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
