const { useState, useEffect, useMemo, useCallback } = React;

const GHANA_CITIES = [
  { name: 'Accra, Greater Accra', lat: 5.6037, lng: -0.1870 },
  { name: 'Kumasi, Ashanti', lat: 6.6885, lng: -1.6244 },
  { name: 'Tema, Greater Accra', lat: 5.6698, lng: -0.0166 },
  { name: 'Takoradi, Western', lat: 4.9016, lng: -1.7831 },
  { name: 'Tamale, Northern', lat: 9.4008, lng: -0.8393 },
  { name: 'Cape Coast, Central', lat: 5.1054, lng: -1.2466 },
  { name: 'Koforidua, Eastern', lat: 6.0941, lng: -0.2591 },
  { name: 'Sunyani, Bono', lat: 7.3349, lng: -2.3123 },
  { name: 'Ho, Volta', lat: 6.6000, lng: 0.4700 },
  { name: 'Wa, Upper West', lat: 10.0600, lng: -2.5000 },
  { name: 'Bolgatanga, Upper East', lat: 10.7856, lng: -0.8514 },
  { name: 'Techiman, Bono East', lat: 7.5833, lng: -1.9333 },
  { name: 'Goaso, Ahafo', lat: 6.8000, lng: -2.5167 },
  { name: 'Nalerigu, North East', lat: 10.5333, lng: -0.3667 },
  { name: 'Damongo, Savannah', lat: 9.0833, lng: -1.8167 },
  { name: 'Sefwi Wiawso, Western North', lat: 6.2000, lng: -2.4833 },
];

function App() {
  // Navigation & Portal State (Role-driven)
  const [activePortal, setActivePortal] = useState('customer'); // 'customer' | 'pharmacy'
  const [activePharmTab, setActivePharmTab] = useState('orders'); // 'orders' | 'inventory' | 'prescriptions'
  
  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [currentToken, setCurrentToken] = useState(null);
  const [pharmacyData, setPharmacyData] = useState(null);

  // Search & Geolocation State
  const [searchQuery, setSearchQuery] = useState('Paracetamol');
  const [location, setLocation] = useState({ lat: 5.6037, lng: -0.1870, name: 'Accra, Greater Accra' });
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Cart
  const [cart, setCart] = useState({
    pharmacyId: null,
    pharmacyName: null,
    fulfillmentType: 'PICKUP',
    items: [],
    customerNote: '',
    deliveryAddress: 'Accra, Greater Accra',
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Modals
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerRole, setRegisterRole] = useState('CUSTOMER'); // 'CUSTOMER' | 'PHARMACY_ADMIN'
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isPhysicalStockModalOpen, setIsPhysicalStockModalOpen] = useState(false);
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [isPosModalOpen, setIsPosModalOpen] = useState(false);
  const [isRxModalOpen, setIsRxModalOpen] = useState(false);

  // Custom location search input inside location modal
  const [customCitySearch, setCustomCitySearch] = useState('');

  // Data history
  const [myOrders, setMyOrders] = useState([]);
  const [pharmacyOrders, setPharmacyOrders] = useState([]);
  const [pharmacyInventory, setPharmacyInventory] = useState([]);
  const [pendingPrescriptions, setPendingPrescriptions] = useState([]);
  
  // Forms state - CLEARED MOCK DATA
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Patient Registration Form
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Pharmacy Registration Form
  const [regPharmName, setRegPharmName] = useState('');
  const [regPharmLicense, setRegPharmLicense] = useState('');
  const [regPharmAddress, setRegPharmAddress] = useState('');

  // Physical Stock Form
  const [selectedStockMedId, setSelectedStockMedId] = useState('');
  const [physicalQty, setPhysicalQty] = useState(50);
  const [physicalUnitPrice, setPhysicalUnitPrice] = useState(12.50);

  // CSV Import & File Upload Form
  const [csvContent, setCsvContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');

  // POS Sync Form
  const [posTerminalId, setPosTerminalId] = useState('POS-TERMINAL-01');
  const [posSyncing, setPosSyncing] = useState(false);

  // Toast Banners
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Geolocation Access Handler (Browser Location API)
  const requestGeoLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }
    showToast('Detecting GPS location for nearest pharmacy proximity matching in Ghana...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        setLocation({
          lat,
          lng,
          name: `GPS Position (${lat}, ${lng})`
        });
        showToast(`📍 Location updated to your live GPS coordinates (${lat}, ${lng})!`, 'success');
        setIsLocationModalOpen(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        showToast(`Could not access GPS (${err.message}). Please select your region or city in Ghana.`, 'info');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [showToast]);

  // Auto-detect location on initial load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lng = Number(pos.coords.longitude.toFixed(4));
          setLocation({
            lat,
            lng,
            name: `GPS Position (${lat}, ${lng})`
          });
        },
        () => {},
        { timeout: 5000 }
      );
    }
  }, []);

  // Perform Search
  const performSearch = useCallback(async (query = searchQuery) => {
    setIsSearching(true);
    try {
      const url = `/v1/medicines/search?q=${encodeURIComponent(query)}&latitude=${location.lat}&longitude=${location.lng}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.data) {
        setSearchResults(data.data || []);
      }
    } catch (err) {
      showToast('Search request failed', 'error');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, location, showToast]);

  useEffect(() => {
    performSearch(searchQuery);
  }, [searchQuery, location.lat, location.lng]);

  // Handle Sign In (Login)
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword })
      });
      const data = await res.json();
      
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || 'Invalid email/phone or password');
      }

      setCurrentUser(data.data.user);
      setCurrentToken(data.data.token);
      setPharmacyData(data.data.pharmacy || null);
      setIsLoginOpen(false);

      if (data.data.user.role === 'PHARMACY_ADMIN' || data.data.user.role === 'PHARMACY_STAFF') {
        setActivePortal('pharmacy');
        showToast(`Welcome to Pharmacy Operations, ${data.data.user.first_name}!`, 'success');
        loadPharmacyData(data.data.token);
      } else {
        setActivePortal('customer');
        showToast(`Welcome back, ${data.data.user.first_name}!`, 'success');
      }
    } catch (err) {
      setAuthError(err.message);
      showToast(err.message, 'error');
    }
  };

  // Handle Create Account (Registration)
  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setAuthError('');

    if (!regFirstName || !regEmail || !regPassword) {
      showToast('Please fill in all required registration fields.', 'error');
      return;
    }

    try {
      const userRes = await fetch('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: regFirstName,
          last_name: regLastName,
          email: regEmail,
          phone: regPhone,
          password: regPassword,
          role: registerRole
        })
      });
      const userData = await userRes.json();
      if (!userRes.ok || !userData.data) {
        throw new Error(userData.error?.message || 'Registration failed');
      }

      const token = userData.data.token;
      let createdPharmacy = null;

      if (registerRole === 'PHARMACY_ADMIN') {
        const pharmRes = await fetch('/v1/pharmacies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            legal_name: `${regPharmName || regFirstName + ' Pharmacy'} Ltd`,
            display_name: regPharmName || `${regFirstName} Pharmacy`,
            license_number: regPharmLicense || `FDA-PH-2024-${Math.floor(1000 + Math.random() * 9000)}`,
            address_line: regPharmAddress || location.name,
            city: location.name.split(',')[0] || 'Accra',
            region: 'Ghana',
            latitude: location.lat,
            longitude: location.lng,
            phone: regPhone || '+233302111222',
            email: regEmail,
            fulfillment_options: { pickup: true, delivery: true, delivery_base_fee_minor: 2000, delivery_radius_km: 15, response_window_minutes: 15 }
          })
        });
        const pharmData = await pharmRes.json();
        if (pharmRes.ok && pharmData.data) {
          createdPharmacy = pharmData.data;
        }
      }

      const loginRes = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: regEmail, password: regPassword })
      });
      const loginData = await loginRes.json();
      if (loginRes.ok && loginData.data) {
        setCurrentUser(loginData.data.user);
        setCurrentToken(loginData.data.token);
        setPharmacyData(loginData.data.pharmacy || createdPharmacy || null);
      } else {
        setCurrentUser(userData.data.user);
        setCurrentToken(userData.data.token);
      }

      setIsRegisterOpen(false);
      
      if (registerRole === 'PHARMACY_ADMIN') {
        setActivePortal('pharmacy');
        showToast(`Pharmacy account registered! Welcome, Pharmacist ${regFirstName}!`, 'success');
        loadPharmacyData(token);
      } else {
        setActivePortal('customer');
        showToast(`Account created! Welcome to PharmaLink, ${regFirstName}!`, 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Load Pharmacy Operations Data
  const loadPharmacyData = useCallback(async (token = currentToken) => {
    if (!token) return;
    try {
      const ordersRes = await fetch('/v1/pharmacy/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ordersData = await ordersRes.json();
      if (ordersRes.ok && ordersData.data) setPharmacyOrders(ordersData.data);

      const invRes = await fetch('/v1/inventory', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const invData = await invRes.json();
      if (invRes.ok && invData.data) setPharmacyInventory(invData.data);

      const rxRes = await fetch('/v1/prescriptions/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const rxData = await rxRes.json();
      if (rxRes.ok && rxData.data) setPendingPrescriptions(rxData.data);

    } catch (err) {
      console.error('Failed to load pharmacy portal data:', err);
    }
  }, [currentToken]);

  useEffect(() => {
    if (activePortal === 'pharmacy' && currentToken) {
      loadPharmacyData(currentToken);
    }
  }, [activePortal, currentToken, loadPharmacyData]);

  // Cart Management
  const addToCart = (resultItem) => {
    const pharmId = resultItem.pharmacy.id;
    const pharmName = resultItem.pharmacy.display_name;

    if (cart.pharmacyId && cart.pharmacyId !== pharmId && cart.items.length > 0) {
      if (!confirm(`Your cart has items from another pharmacy (${cart.pharmacyName}). Clear cart to add from ${pharmName}?`)) {
        return;
      }
      setCart({
        pharmacyId: pharmId,
        pharmacyName: pharmName,
        fulfillmentType: 'PICKUP',
        items: [{ medicine: resultItem.medicine, quantity: 1, price: resultItem.price }],
        customerNote: '',
        deliveryAddress: location.name,
      });
      showToast(`Cart updated with items from ${pharmName}`, 'info');
      return;
    }

    setCart((prev) => {
      const existing = prev.items.find((i) => i.medicine.id === resultItem.medicine.id);
      let updatedItems;
      if (existing) {
        updatedItems = prev.items.map((i) =>
          i.medicine.id === resultItem.medicine.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      } else {
        updatedItems = [...prev.items, { medicine: resultItem.medicine, quantity: 1, price: resultItem.price }];
      }
      return {
        ...prev,
        pharmacyId: pharmId,
        pharmacyName: pharmName,
        items: updatedItems,
      };
    });
    showToast(`Added ${resultItem.medicine.generic_name} to cart`, 'success');
  };

  const updateCartQty = (medId, delta) => {
    setCart((prev) => {
      const updated = prev.items
        .map((i) => (i.medicine.id === medId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0);
      return { ...prev, items: updated };
    });
  };

  // Submit Order
  const handleCheckout = async () => {
    if (!currentToken) {
      setIsCartOpen(false);
      setIsLoginOpen(true);
      showToast('Please sign in to place your order', 'info');
      return;
    }

    if (cart.items.length === 0) return;

    try {
      const res = await fetch('/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({
          pharmacy_id: cart.pharmacyId,
          fulfillment_type: cart.fulfillmentType,
          customer_note: cart.customerNote,
          delivery_address: cart.fulfillmentType === 'DELIVERY' ? cart.deliveryAddress : undefined,
          items: cart.items.map((i) => ({ medicine_id: i.medicine.id, quantity: i.quantity }))
        })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Failed to submit order');

      showToast(`Order #${data.data.id.substring(0, 8)} placed successfully!`, 'success');
      setCart({ pharmacyId: null, pharmacyName: null, fulfillmentType: 'PICKUP', items: [], customerNote: '', deliveryAddress: location.name });
      setIsCartOpen(false);
      fetchMyOrders();
      setIsMyOrdersOpen(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Fetch Customer Orders
  const fetchMyOrders = async () => {
    if (!currentToken) return;
    try {
      const res = await fetch('/v1/orders', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (res.ok && data.data) setMyOrders(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Pharmacy Actions: Accept Order
  const handleAcceptOrder = async (orderId) => {
    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Accept order failed');

      showToast(`Order accepted & stock reserved atomically!`, 'success');
      loadPharmacyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Pharmacy Actions: Reject Order
  const handleRejectOrder = async (orderId) => {
    const reason = prompt('Reason for rejecting order:', 'Out of physical stock');
    if (!reason) return;
    try {
      const res = await fetch(`/v1/pharmacy/orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ rejection_reason: reason })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Reject order failed');

      showToast(`Order rejected & stock reservation released.`, 'info');
      loadPharmacyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Physical Stock Confirmation Submission
  const handleConfirmPhysicalStock = async (e) => {
    e.preventDefault();
    if (!selectedStockMedId) {
      showToast('Please select a medicine', 'error');
      return;
    }
    try {
      const res = await fetch('/v1/inventory/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({
          medicine_id: selectedStockMedId,
          physical_quantity: Number(physicalQty),
          unit_price_minor: Math.round(Number(physicalUnitPrice) * 100),
          note: 'Physical count verified on shelf'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'Update stock failed');

      showToast(`Stock updated to ${physicalQty} units (State: VERIFIED)`, 'success');
      setIsPhysicalStockModalOpen(false);
      loadPharmacyData();
      performSearch(searchQuery);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // File Upload Handler for CSV
  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === 'string') {
        setCsvContent(text);
        showToast(`Loaded ${file.name} (${Math.round(file.size / 1024)} KB)`, 'success');
      }
    };
    reader.readAsText(file);
  };

  // CSV Import Submission
  const handleCsvImport = async (e) => {
    e.preventDefault();
    if (!csvContent || csvContent.trim() === '') {
      showToast('Please upload or paste CSV content first', 'error');
      return;
    }
    try {
      const res = await fetch('/v1/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ csv_content: csvContent })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'CSV Import failed');

      showToast(`CSV Import Completed: ${data.data.records_accepted} accepted, ${data.data.records_rejected} rejected`, 'success');
      setIsCsvImportModalOpen(false);
      setCsvContent('');
      setUploadedFileName('');
      loadPharmacyData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // POS System Synchronization Trigger
  const handlePosSync = async (e) => {
    if (e) e.preventDefault();
    setPosSyncing(true);
    try {
      const res = await fetch('/v1/inventory/pos-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ terminal_id: posTerminalId })
      });
      const data = await res.json();
      if (!res.ok || !data.data) throw new Error(data.error?.message || 'POS Sync failed');

      showToast(`POS Sync Completed! Received ${data.data.records_received} items from ${posTerminalId} (Source: POS)`, 'success');
      setIsPosModalOpen(false);
      loadPharmacyData();
      performSearch(searchQuery);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPosSyncing(false);
    }
  };

  // Cart total calculations
  const cartSubtotal = useMemo(() => {
    return cart.items.reduce((sum, item) => sum + (item.price.unit_price_minor / 100) * item.quantity, 0);
  }, [cart.items]);

  const deliveryFee = cart.fulfillmentType === 'DELIVERY' ? 20.00 : 0.00;
  const cartTotal = cartSubtotal + deliveryFee;

  // Filtered city list in modal
  const filteredGhanaCities = useMemo(() => {
    if (!customCitySearch.trim()) return GHANA_CITIES;
    return GHANA_CITIES.filter((c) => c.name.toLowerCase().includes(customCitySearch.toLowerCase().trim()));
  }, [customCitySearch]);

  return (
    <div className="flex min-h-screen flex-col">
      
      {/* DRUGNELLY HEADER - CLEAN NAVBAR WITH DYNAMIC GHANA LOCATION */}
      <header className="navbar">
        <div className="navbar-container">
          <div className="brand-wrapper clickable" onClick={() => setActivePortal('customer')}>
            <div className="brand-logo-badge">💊</div>
            <span>PharmaLink</span>
          </div>

          <nav className="nav-links">
            <button className={activePortal === 'customer' ? 'active' : ''} onClick={() => setActivePortal('customer')}>Medicines</button>
            <button onClick={() => setIsRxModalOpen(true)}>Prescriptions</button>
            <a href="#pharmacies">Pharmacies</a>
            <a href="#how">How it works</a>
          </nav>

          <div className="nav-actions">
            {/* Dynamic Location Pill (No Hardcoded Dropdown) */}
            <button
              className="location-pill clickable"
              onClick={() => setIsLocationModalOpen(true)}
              title="Click to change location or detect GPS anywhere in Ghana"
            >
              <span>📍</span>
              <span style={{ fontWeight: 700 }}>{location.name}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>✏️</span>
            </button>

            {/* Auth Actions: Clean Sign In & Create Account */}
            {currentUser ? (
              <button className="btn btn-secondary btn-sm" onClick={() => setIsProfileOpen(true)}>
                👤 {currentUser.first_name} ({currentUser.role === 'CUSTOMER' ? 'Patient' : 'Pharmacy Admin'})
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setLoginIdentifier(''); setLoginPassword(''); setIsLoginOpen(true); }}>
                  Sign in
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => { setRegisterRole('CUSTOMER'); setIsRegisterOpen(true); }}>
                  Create account
                </button>
              </div>
            )}

            {/* Cart Bag Icon Button */}
            <button className="btn btn-secondary btn-sm" style={{ padding: '0.45rem 0.75rem' }} onClick={() => setIsCartOpen(true)}>
              🛍️ <span className="badge badge-verified" style={{ marginLeft: '4px' }}>{cart.items.reduce((sum, i) => sum + i.quantity, 0)}</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main style={{ flex: 1 }}>
        {activePortal === 'customer' ? (
          <div>
            
            {/* DRUGNELLY HERO BENTO GRID */}
            <section className="container-page" style={{ paddingTop: '2rem' }}>
              <div className="hero-bento">
                
                {/* Main Hero Card */}
                <div className="hero-main-card">
                  <div>
                    <span className="hero-pill">
                      <span className="hero-dot"></span> Licensed pharmacies across Ghana
                    </span>
                    <h1 className="hero-heading">
                      Medicine, from the pharmacy <span>closest to you</span>.
                    </h1>
                    <p className="hero-description">
                      PharmaLink matches your order to the nearest partner pharmacy with verified stock across Ghana.
                    </p>

                    {/* Integrated Search Form */}
                    <form className="hero-search-form" onSubmit={(e) => { e.preventDefault(); performSearch(searchQuery); }}>
                      <span style={{ marginLeft: '0.75rem', color: 'var(--text-muted)' }}>🔍</span>
                      <input
                        className="hero-search-input"
                        placeholder="Search Paracetamol, Vitamin C, Amoxicillin, Coartem..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <button type="submit" className="btn btn-primary hero-search-btn">
                        {isSearching ? 'Searching...' : 'Search'}
                      </button>
                    </form>

                    {/* Query Chips & Geolocation Access Trigger */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div className="hero-query-chips">
                        {['Paracetamol', 'Vitamin C', 'ORS', 'Cetirizine', 'Amoxicillin', 'Coartem'].map((term) => (
                          <button
                            key={term}
                            className="query-chip"
                            onClick={() => {
                              setSearchQuery(term);
                              performSearch(term);
                            }}
                          >
                            {term}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={requestGeoLocation}
                          style={{ fontSize: '0.78rem' }}
                        >
                          🎯 Detect GPS Location
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setIsLocationModalOpen(true)}
                          style={{ fontSize: '0.78rem' }}
                        >
                          📍 Change Location
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hero Image Card */}
                <div className="hero-side-image">
                  <div style={{ position: 'absolute', inset: 0, padding: '1.5rem', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>Authentic & Verified</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Directly from licensed Ghanaian pharmacies</div>
                  </div>
                </div>

                {/* Upload Prescription Card */}
                <div className="hero-rx-card">
                  <div className="rx-icon-badge">📄</div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '1rem' }}>Upload your prescription</h3>
                    <p style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '0.25rem' }}>Snap a photo, a pharmacist verifies it, we deliver.</p>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: '1rem', width: 'fit-content' }} onClick={() => setIsRxModalOpen(true)}>
                    Upload now →
                  </button>
                </div>

              </div>

              {/* STATS COUNTER BANNER */}
              <div className="stats-banner">
                <div>
                  <div className="stat-number">120+</div>
                  <div className="stat-label">Partner pharmacies</div>
                </div>
                <div>
                  <div className="stat-number">8,400+</div>
                  <div className="stat-label">Medicines available</div>
                </div>
                <div>
                  <div className="stat-number">&lt; 60 min</div>
                  <div className="stat-label">Average delivery</div>
                </div>
                <div>
                  <div className="stat-number">16 regions</div>
                  <div className="stat-label">Nationwide coverage</div>
                </div>
              </div>
            </section>

            {/* SHOP BY CATEGORY SECTION */}
            <section className="container-page" style={{ marginTop: '3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h2 className="section-title">Shop by category</h2>
                  <p className="section-sub">Curated picks across the wellness aisle.</p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => performSearch('')}>Browse all →</button>
              </div>

              <div className="categories-grid">
                {[
                  { emoji: '🩹', name: 'Pain Relief', count: '142 items', q: 'Paracetamol' },
                  { emoji: '💊', name: 'Antibiotics', count: '64 items', q: 'Amoxicillin' },
                  { emoji: '🍊', name: 'Vitamins', count: '218 items', q: 'Vitamin C' },
                  { emoji: '🍼', name: 'Baby Care', count: '96 items', q: 'Calpol' },
                  { emoji: '🌸', name: "Women's Health", count: '78 items', q: 'Iron' },
                  { emoji: '🧔', name: "Men's Health", count: '54 items', q: 'Zinc' },
                  { emoji: '➕', name: 'First Aid', count: '41 items', q: 'Bandage' },
                  { emoji: '✨', name: 'Skincare', count: '130 items', q: 'Cetirizine' },
                ].map((cat, idx) => (
                  <div
                    key={idx}
                    className="category-card clickable"
                    onClick={() => {
                      setSearchQuery(cat.q);
                      performSearch(cat.q);
                    }}
                  >
                    <span className="category-emoji">{cat.emoji}</span>
                    <span className="category-name">{cat.name}</span>
                    <span className="category-count">{cat.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* TRENDING / MEDICINE STOCK RESULTS SECTION */}
            <section className="container-page" style={{ marginTop: '3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h2 className="section-title">Available Medicines Near You</h2>
                  <p className="section-sub">Real-time stock matched to pharmacies nearest to {location.name}.</p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => performSearch(searchQuery)}>Refresh Stock</button>
              </div>

              <div className="products-grid">
                {searchResults.map((item, idx) => {
                  const isVerified = item.availability_state === 'VERIFIED';
                  const isLikely = item.availability_state === 'LIKELY';
                  const badgeClass = isVerified ? 'badge-verified' : isLikely ? 'badge-likely' : 'badge-uncertain';

                  return (
                    <div key={idx} className="product-card">
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{item.medicine.brand_name || item.medicine.generic_name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.medicine.generic_name} • {item.medicine.formulation}</div>
                          </div>
                          <span className={`badge ${badgeClass}`}>
                            {isVerified ? '✓ VERIFIED' : '⚡ LIKELY'}
                          </span>
                        </div>

                        <div style={{ margin: '0.85rem 0', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>🏥 {item.pharmacy.display_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>📍 {item.pharmacy.address_line} ({item.distance_km} km away)</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>🕒 {item.freshness} • {item.available_quantity} in stock</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>{item.price.formatted}</div>
                        <button className="btn btn-primary btn-sm" onClick={() => addToCart(item)}>
                          + Add to Order
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* HOW IT WORKS SECTION */}
            <section id="how" className="container-page" style={{ marginTop: '4rem' }}>
              <h2 className="section-title">How it works</h2>
              <p className="section-sub">From search to doorstep in three simple steps.</p>

              <div className="steps-grid">
                <div className="step-card">
                  <div className="step-icon-wrapper">
                    <div className="step-icon">🔍</div>
                    <div className="step-badge">Step 1</div>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '1rem' }}>Search or upload Rx</h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Find any medicine by generic name, brand or symptom — or snap a picture of your doctor's prescription.
                  </p>
                </div>

                <div className="step-card">
                  <div className="step-icon-wrapper">
                    <div className="step-icon">📍</div>
                    <div className="step-badge">Step 2</div>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '1rem' }}>We match the nearest pharmacy</h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Our engine ranks licensed partner pharmacies by distance, real-time stock availability, and prices.
                  </p>
                </div>

                <div className="step-card">
                  <div className="step-icon-wrapper">
                    <div className="step-icon">🚚</div>
                    <div className="step-badge">Step 3</div>
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '1rem' }}>Pickup or delivery</h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Collect at dispensary counter within minutes or enjoy express same-day doorstep delivery to your location.
                  </p>
                </div>
              </div>
            </section>

            {/* PHARMACIES NEAR YOU SECTION */}
            <section id="pharmacies" className="container-page" style={{ marginTop: '4rem' }}>
              <h2 className="section-title">Pharmacies near you</h2>
              <p className="section-sub">Verified, licensed partners ready to fulfill your order.</p>

              <div className="products-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {[
                  { name: 'East Legon Pharmacy', area: 'Lagos Avenue, East Legon', license: 'FDA-PH-2023-0101', status: 'VERIFIED' },
                  { name: 'Osu Standard Chemist', area: 'Oxford Street, Osu', license: 'FDA-PH-2022-0452', status: 'VERIFIED' },
                  { name: 'Airport Residential Pharmacy', area: 'Airport Residential, Accra', license: 'FDA-PH-2021-0899', status: 'VERIFIED' },
                  { name: 'Spintex Care Pharmacy', area: 'Spintex Road, Accra', license: 'FDA-PH-2023-1120', status: 'VERIFIED' },
                ].map((pharm, i) => (
                  <div key={i} className="step-card">
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🏥</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{pharm.name}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>📍 {pharm.area}</div>
                    <div style={{ marginTop: '0.75rem' }}>
                      <span className="badge badge-verified">✓ {pharm.license}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* TRUST & GUARANTEE BANNER */}
            <section className="container-page" style={{ marginTop: '4rem' }}>
              <div className="trust-banner">
                <div className="trust-item">
                  <div className="trust-icon">🛡️</div>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>Pharmacy-board licensed</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Every partner is verified by Ghana's Pharmacy Council.</p>
                  </div>
                </div>

                <div className="trust-item">
                  <div className="trust-icon">🚚</div>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>Cold-chain ready</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Temperature-sensitive meds handled with care.</p>
                  </div>
                </div>

                <div className="trust-item">
                  <div className="trust-icon">🕒</div>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>Same-day delivery</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Across Accra, Kumasi, Tema and Takoradi.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          /* PHARMACY OPERATIONS PORTAL (Role-based Dashboard) */
          <div className="container-page">
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '1.75rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge badge-verified" style={{ marginBottom: '0.5rem' }}>
                  🏥 PHARMACY OPERATIONS DASHBOARD
                </span>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>
                  {pharmacyData?.display_name || 'East Legon Pharmacy Ltd'}
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                  Accra Dispensary & Real-Time Stock Management • License: FDA-PH-2023-0101
                </p>
              </div>

              {/* INTEGRATION ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => setIsPosModalOpen(true)}>
                  ⚡ POS Integration Sync
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsPhysicalStockModalOpen(true)}>
                  📋 Physical Shelf Check
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setIsCsvImportModalOpen(true)}>
                  📁 Upload CSV Inventory File
                </button>
              </div>
            </div>

            {/* TAB NAV */}
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
              <button
                className={`btn btn-sm ${activePharmTab === 'orders' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setActivePharmTab('orders')}
              >
                Incoming Customer Orders ({pharmacyOrders.length})
              </button>
              <button
                className={`btn btn-sm ${activePharmTab === 'inventory' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setActivePharmTab('inventory')}
              >
                Stock & Inventory ({pharmacyInventory.length})
              </button>
              <button
                className={`btn btn-sm ${activePharmTab === 'prescriptions' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setActivePharmTab('prescriptions')}
              >
                Pending Prescriptions ({pendingPrescriptions.length})
              </button>
            </div>

            {/* ORDERS TABLE */}
            {activePharmTab === 'orders' && (
              <div style={{ background: 'white', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.85rem 1rem' }}>Order ID</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Fulfillment</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Total</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pharmacyOrders.map((ord) => (
                      <tr key={ord.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          #{ord.id.substring(0, 8)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>{ord.fulfillment_type === 'PICKUP' ? '🏥 Pickup' : '🚚 Delivery'}</td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--primary)' }}>GHS {(ord.total_amount_minor / 100).toFixed(2)}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className={`badge ${ord.status === 'ACCEPTED' ? 'badge-verified' : 'badge-likely'}`}>{ord.status}</span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {ord.status === 'PENDING' && (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleAcceptOrder(ord.id)}>
                                ✓ Accept & Lock Stock
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleRejectOrder(ord.id)}>
                                ✕ Reject
                              </button>
                            </div>
                          )}
                          {ord.status === 'ACCEPTED' && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>🔒 Stock Reserved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* INVENTORY TABLE */}
            {activePharmTab === 'inventory' && (
              <div style={{ background: 'white', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.85rem 1rem' }}>Medicine Name</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Source</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Available</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Reserved</th>
                      <th style={{ padding: '0.85rem 1rem' }}>Unit Price</th>
                      <th style={{ padding: '0.85rem 1rem' }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pharmacyInventory.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <strong>{item.generic_name}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.brand_name || 'Generic'}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}><span className="badge badge-likely">{item.source_type}</span></td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>{item.available_quantity} units</td>
                        <td style={{ padding: '0.85rem 1rem' }}>{item.reserved_quantity} units</td>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--primary)', fontWeight: 700 }}>GHS {(item.unit_price_minor / 100).toFixed(2)}</td>
                        <td style={{ padding: '0.85rem 1rem' }}><span className="badge badge-verified">{item.availability_state}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="brand-wrapper" style={{ marginBottom: '0.75rem' }}>
              <div className="brand-logo-badge">💊</div>
              <span>PharmaLink</span>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Ghana's licensed pharmacy marketplace. Authentic medicines delivered from the pharmacy nearest you.
            </p>
          </div>

          <div className="footer-col">
            <h4>Shop</h4>
            <ul>
              <li><a href="#" onClick={() => performSearch('')}>All medicines</a></li>
              <li><a href="#" onClick={() => performSearch('Paracetamol')}>Categories</a></li>
              <li><a href="#" onClick={() => setIsRxModalOpen(true)}>Prescriptions</a></li>
              <li><a href="#" onClick={() => performSearch('Vitamin')}>Wellness</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="#">About</a></li>
              <li><a href="#" onClick={() => { setRegisterRole('PHARMACY_ADMIN'); setIsRegisterOpen(true); }}>Pharmacy partners</a></li>
              <li><a href="#">Careers</a></li>
              <li><a href="#">Press</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Support</h4>
            <ul>
              <li><a href="#">Help center</a></li>
              <li><a href="#">Contact</a></li>
              <li><a href="#">Returns</a></li>
              <li><a href="#">Privacy policy</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          © 2026 PharmaLink. Licensed pharmacy marketplace for Ghana.
        </div>
      </footer>

      {/* GHANA NATIONWIDE LOCATION SELECTOR MODAL */}
      {isLocationModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLocationModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>📍 Select Location in Ghana</h3>
              <button className="modal-close" onClick={() => setIsLocationModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {/* GPS Button */}
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '1.25rem', padding: '0.75rem' }}
                onClick={requestGeoLocation}
              >
                🎯 Detect Live GPS Location
              </button>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Search Region or City in Ghana</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search e.g. Kumasi, Takoradi, Tamale, Sunyani..."
                    value={customCitySearch}
                    onChange={(e) => setCustomCitySearch(e.target.value)}
                  />
                </div>

                <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {filteredGhanaCities.map((city, i) => (
                    <button
                      key={i}
                      className="btn btn-secondary btn-sm"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '0.6rem 0.85rem' }}
                      onClick={() => {
                        setLocation({ lat: city.lat, lng: city.lng, name: city.name });
                        setIsLocationModalOpen(false);
                        showToast(`Location set to ${city.name}`, 'success');
                      }}
                    >
                      📍 <strong>{city.name}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {isCartOpen && (
        <div className="modal-overlay" onClick={() => setIsCartOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>🛍️ Your Cart</h3>
              <button className="modal-close" onClick={() => setIsCartOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {cart.items.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  Your cart is empty.
                </p>
              ) : (
                <div>
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                    Ordering from: <strong>{cart.pharmacyName}</strong>
                  </div>

                  {cart.items.map((item) => (
                    <div key={item.medicine.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.medicine.generic_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>GHS {(item.price.unit_price_minor / 100).toFixed(2)} each</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => updateCartQty(item.medicine.id, -1)}>-</button>
                        <span style={{ fontWeight: 700 }}>{item.quantity}</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => updateCartQty(item.medicine.id, 1)}>+</button>
                      </div>
                    </div>
                  ))}

                  <div className="form-group" style={{ marginTop: '1.25rem' }}>
                    <label className="form-label">Fulfillment Option</label>
                    <select
                      className="form-select"
                      value={cart.fulfillmentType}
                      onChange={(e) => setCart({ ...cart, fulfillmentType: e.target.value })}
                    >
                      <option value="PICKUP">🏥 Pharmacy Pickup (Free)</option>
                      <option value="DELIVERY">🚚 Doorstep Delivery (+GHS 20.00)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '1.1rem', fontWeight: 800 }}>
                    <span>Total Amount:</span>
                    <span style={{ color: 'var(--primary)' }}>GHS {cartTotal.toFixed(2)}</span>
                  </div>

                  <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem', padding: '0.75rem' }} onClick={handleCheckout}>
                    ✓ Submit Order to Pharmacy
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLEAN SIGN IN MODAL - NO SEED MOCK DATA */}
      {isLoginOpen && (
        <div className="modal-overlay" onClick={() => setIsLoginOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Sign In to PharmaLink</h3>
              <button className="modal-close" onClick={() => setIsLoginOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {authError && (
                <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.65rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {authError}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">Email Address or Phone Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter email or phone (e.g. 0550000006)"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
                  Sign In
                </button>
              </form>

              <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.85rem' }}>
                Don't have an account?{' '}
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => { setIsLoginOpen(false); setIsRegisterOpen(true); }}
                >
                  Create an account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ACCOUNT MODAL */}
      {isRegisterOpen && (
        <div className="modal-overlay" onClick={() => setIsRegisterOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                {registerRole === 'CUSTOMER' ? '✨ Create Patient Account' : '🏥 Onboard Pharmacy Account'}
              </h3>
              <button className="modal-close" onClick={() => setIsRegisterOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${registerRole === 'CUSTOMER' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRegisterRole('CUSTOMER')}
                >
                  👤 Patient Account
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${registerRole === 'PHARMACY_ADMIN' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRegisterRole('PHARMACY_ADMIN')}
                >
                  🏥 Pharmacy Owner
                </button>
              </div>

              <form onSubmit={handleRegister}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">First Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="e.g. Kwame"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="e.g. Mensah"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. kwame@gmail.com"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="e.g. 0550000006"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    className="form-input"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                  />
                </div>

                {registerRole === 'PHARMACY_ADMIN' && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--primary)' }}>
                      Pharmacy Organization Details
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pharmacy Display Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={regPharmName}
                        onChange={(e) => setRegPharmName(e.target.value)}
                        placeholder="e.g. Airport Residential Pharmacy"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Pharmacy License Number</label>
                      <input
                        type="text"
                        className="form-input"
                        value={regPharmLicense}
                        onChange={(e) => setRegPharmLicense(e.target.value)}
                        placeholder="e.g. FDA-PH-2024-001"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Address / Street Location *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={regPharmAddress}
                        onChange={(e) => setRegPharmAddress(e.target.value)}
                        placeholder="e.g. Oxford Street, Osu, Accra"
                        required
                      />
                    </div>
                  </div>
                )}

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}>
                  ✓ Create Account & Sign In
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CSV FILE UPLOAD MODAL */}
      {isCsvImportModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCsvImportModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>📁 Upload CSV Inventory File</h3>
              <button className="modal-close" onClick={() => setIsCsvImportModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCsvImport}>
                <div className="form-group">
                  <label className="form-label">Select CSV File from Computer</label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="form-input"
                    onChange={handleCsvFileUpload}
                  />
                  {uploadedFileName && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700, marginTop: '4px' }}>
                      Selected file: {uploadedFileName}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">CSV Content Preview / Raw Text</label>
                  <textarea
                    className="form-textarea"
                    rows="6"
                    value={csvContent}
                    onChange={(e) => setCsvContent(e.target.value)}
                    placeholder="Medicine Name,Quantity,Unit Price..."
                  ></textarea>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}>
                  Process CSV Import
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* POS INTEGRATION MODAL */}
      {isPosModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPosModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>⚡ POS System (Point of Sale) Integration</h3>
              <button className="modal-close" onClick={() => setIsPosModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '0.85rem', background: '#ecfdf5', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                Connect your pharmacy POS terminal (Apex, Kroll, QuickBooks) to continuously update verified stock and price signals.
              </div>

              <form onSubmit={handlePosSync}>
                <div className="form-group">
                  <label className="form-label">Select POS Terminal / System</label>
                  <select
                    className="form-select"
                    value={posTerminalId}
                    onChange={(e) => setPosTerminalId(e.target.value)}
                  >
                    <option value="POS-MAIN-01">Dispensary Main Counter (POS-MAIN-01)</option>
                    <option value="Apex-POS-Terminal">Apex Pharmacy POS System</option>
                    <option value="Kroll-POS-Dispensary">Kroll Pharmacy Management</option>
                    <option value="QuickBooks-POS-Store">QuickBooks POS Terminal</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={posSyncing}>
                  {posSyncing ? 'Synchronizing POS Data...' : '⚡ Run Instant POS Stock Sync'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* USER PROFILE MODAL */}
      {isProfileOpen && currentUser && (
        <div className="modal-overlay" onClick={() => setIsProfileOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Your Account Profile</h3>
              <button className="modal-close" onClick={() => setIsProfileOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{currentUser.first_name} {currentUser.last_name || ''}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{currentUser.email || currentUser.phone}</div>
                <span className="badge badge-verified" style={{ marginTop: '0.5rem' }}>
                  Role: {currentUser.role}
                </span>
              </div>

              <button
                className="btn btn-outline"
                style={{ width: '100%', color: '#991b1b', borderColor: '#fca5a5' }}
                onClick={() => {
                  setCurrentUser(null);
                  setCurrentToken(null);
                  setPharmacyData(null);
                  setIsProfileOpen(false);
                  setActivePortal('customer');
                  showToast('Signed out of session', 'info');
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST CONTAINER */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'} {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// Render React App
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
