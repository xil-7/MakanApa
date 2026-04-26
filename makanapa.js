// --- CONFIGURATION ---
const supabaseUrl = 'https://ujndksyjogxnhlgaezuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbmRrc3lqb2d4bmhsZ2FlenV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTM4NzUsImV4cCI6MjA5MTcyOTg3NX0.JmWTrUlAagv9Ae0NHwSaX3T8sN0OaQkbsQiJYs7OwJU';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Check if we are on the Seller Page or Buyer Page
const isSellerPage = document.body.classList.contains('seller-theme');

// --- CONFIGURATION CHECK LOGIC ---
function isProfileSet() {
    if (isSellerPage) {
        return !!(localStorage.getItem('seller_phone') && localStorage.getItem('seller_name'));
    } else {
        return !!(localStorage.getItem('buyer_phone') && localStorage.getItem('buyer_name'));
    }
}

function checkProfile() {
    if (!isProfileSet()) {
        showToast('Profile Setup Required', 'Please set up your Name and Phone Number in Settings (⚙️) first!', 'error');
        if (typeof openConfig === 'function') openConfig();
        return false;
    }
    return true;
}

function updateGatekeeperUI() {
    const profileSet = isProfileSet();
    
    // Buyer UI lock
    if (!isSellerPage) {
        const sendBtn = document.getElementById('send-btn');
        const userInput = document.getElementById('user-input');
        
        if (sendBtn) {
            if (!profileSet) {
                sendBtn.style.opacity = '0.5';
                sendBtn.style.cursor = 'not-allowed';
                sendBtn.classList.remove('hover:scale-105', 'active:scale-95');
            } else {
                sendBtn.style.opacity = '1';
                sendBtn.style.cursor = 'pointer';
                sendBtn.classList.add('hover:scale-105', 'active:scale-95');
            }
        }
        
        if (userInput) {
            if (!profileSet) {
                userInput.placeholder = "Profile Setup Required. Click ⚙️ to set up.";
                userInput.disabled = true;
                userInput.style.opacity = '0.5';
                userInput.style.cursor = 'not-allowed';
            } else {
                userInput.placeholder = "What are you craving? 🤔";
                userInput.disabled = false;
                userInput.style.opacity = '1';
                userInput.style.cursor = 'text';
            }
        }
    }
}

function openConfig() {
    const modal = document.getElementById('auth-modal');

    const savedName = isSellerPage ? localStorage.getItem('seller_name') : localStorage.getItem('buyer_name');
    const savedPhone = isSellerPage ? localStorage.getItem('seller_phone') : localStorage.getItem('buyer_phone');

    const nameInput = document.getElementById('auth-name');
    const phoneInput = document.getElementById('auth-phone');

    if (nameInput) nameInput.value = savedName || '';
    if (phoneInput) phoneInput.value = savedPhone || '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

async function saveConfig() {
    const nameInput = document.getElementById('auth-name');
    const phoneInput = document.getElementById('auth-phone');
    let name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!name || !phone) {
        alert('Tolong isi nama dan nomor HP dulu ya!');
        return;
    }

    // --- AUTO GENERATE ID (e.g. "Budi 1107") ---
    const suffix = phone.slice(-4);
    if (!name.endsWith(suffix)) {
        name = `${name} ${suffix}`;
        if (nameInput) nameInput.value = name;
    }

    // --- Save separately so Buyer & Seller configs don't collide ---
    if (isSellerPage) {
        localStorage.setItem('seller_name', name);
        localStorage.setItem('seller_phone', phone);
    } else {
        localStorage.setItem('buyer_name', name);
        localStorage.setItem('buyer_phone', phone);
    }
    localStorage.setItem('user_phone', phone);

    // Close the modal first so the UI feels snappy
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // --- AUTO-LOGIN: fetch/create the user row and refresh the UI immediately ---
    await fetchUserProfile();

    // On the seller page, re-render offer cards so seller name & contact populate right away
    if (isSellerPage) {
        loadSellerRequests();
    }

    updateGatekeeperUI();

    alert("Profile saved! ✅");
}

// State
let currentRequestId = null;
let pollingInterval = null;
let auctionContainer = null;
let userHabit = null;
let currentUser = null;
let currentDbUser = null;
let isProcessing = false;
let deliveryMap = null;
let deliveryMarker = null;
let deliveryCoords = null; // { lat, lng }
let currentOrderContext = {}; // seller/food/price/contact/stock for submitOrder

// UI Elements
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');

/* ── TOAST SYSTEM ── */
function showToast(title, message, type = 'default', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { default: '🔔', success: '✅', error: '❌', buyer: '🛵', seller: '📦' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || '🔔'}</div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 320);
    }, duration);
}

/* ── SPINNER ── */
function showSpinner() { const el = document.getElementById('loading-overlay'); if (el) el.classList.remove('hidden'); }
function hideSpinner() { const el = document.getElementById('loading-overlay'); if (el) el.classList.add('hidden'); }

/* ── QTY STEPPER with stock-guard toast ── */
function changeQty(delta) {
    const input = document.getElementById('order-qty');
    if (!input) return;
    const max = parseInt(input.max) || 99;
    let val = parseInt(input.value || 1) + delta;
    if (val < 1) val = 1;
    if (val > max) {
        showToast('Stock limit reached', `Sorry, only ${max} item(s) available!`, 'error', 3000);
        val = max;
    }
    input.value = val;
    // Manually fire the oninput handler so the total re-calculates
    input.dispatchEvent(new Event('input'));
}

/* ── LEAFLET MAP ── */
function initDeliveryMap() {
    if (!window.L) return;
    const mapEl = document.getElementById('delivery-map');
    if (!mapEl) return;

    // Destroy previous instance if any
    if (deliveryMap) { deliveryMap.remove(); deliveryMap = null; deliveryMarker = null; }

    const defaultLat = -6.2088; // Jakarta fallback
    const defaultLng = 106.8456;

    deliveryMap = L.map('delivery-map', { zoomControl: true }).setView([defaultLat, defaultLng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(deliveryMap);

    const pinIcon = L.divIcon({
        html: '<div style="font-size:28px;line-height:1;">📍</div>',
        iconAnchor: [14, 28],
        className: ''
    });

    deliveryMarker = L.marker([defaultLat, defaultLng], { draggable: true, icon: pinIcon }).addTo(deliveryMap);
    deliveryCoords = { lat: defaultLat, lng: defaultLng };

    deliveryMarker.on('dragend', async (e) => {
        const { lat, lng } = e.target.getLatLng();
        deliveryCoords = { lat, lng };
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
            const d = await res.json();
            const addrEl = document.getElementById('order-address');
            if (addrEl) addrEl.value = d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        } catch (_) { }
    });

    deliveryMap.on('click', (e) => {
        const { lat, lng } = e.latlng;
        deliveryMarker.setLatLng([lat, lng]);
        deliveryCoords = { lat, lng };
    });

    // Fix Leaflet tile rendering in modals
    setTimeout(() => deliveryMap.invalidateSize(), 320);
}

async function locateMeOnMap() {
    if (!navigator.geolocation) { showToast('Geolocation not supported', '', 'error'); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        deliveryCoords = { lat, lng };
        if (deliveryMap && deliveryMarker) {
            deliveryMap.setView([lat, lng], 16);
            deliveryMarker.setLatLng([lat, lng]);
        }
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
            const d = await res.json();
            const addrEl = document.getElementById('order-address');
            if (addrEl) addrEl.value = d.display_name;
            localStorage.setItem('buyer_address', d.display_name);
        } catch (_) { }
        showToast('Location pinned!', 'Drag the marker to adjust.', 'success');
    }, () => showToast('Permission denied', 'Enable location access.', 'error'));
}

const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!checkProfile()) return;
    if (isProcessing) return;

    const val = userInput.value.trim();
    if (!val) return;

    isProcessing = true;
    userInput.value = '';
    addMessage(val, "user");

    if (typeof sendRequest === 'function') sendRequest(val);
    setTimeout(() => { isProcessing = false; }, 500);
};

async function chooseAddress() {
    if (!navigator.geolocation) {
        alert("Geolocation not supported");
        return;
    }

    navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
            );
            const data = await res.json();
            const fullAddress = data.display_name;

            document.getElementById('order-address').value = fullAddress;
            localStorage.setItem('buyer_address', fullAddress);
            alert("Full address selected 📍");
        } catch (err) {
            console.error(err);
            alert("Failed to get address");
        }
    }, () => {
        alert("Location permission denied");
    });
}

/**
 * fetchUserProfile — the single "auto-login" entry point.
 * Reads the phone from localStorage, looks up (or creates) the matching
 * row in `users`, stores it in currentDbUser, then refreshes all
 * user-specific UI elements (balance, habits).
 * Called on: page load, saveConfig(), submitTopup().
 */
async function fetchUserProfile() {
    const phone = isSellerPage ? localStorage.getItem('seller_phone') : localStorage.getItem('buyer_phone');
    const name = isSellerPage ? localStorage.getItem('seller_name') : localStorage.getItem('buyer_name');
    if (!phone) return;

    try {
        let { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('phone', phone)
            .single();

        if (!data) {
            // First time this user logs in — create their row with balance 0
            const { data: newUser, error: insertError } = await supabaseClient
                .from('users')
                .insert([{ phone: phone, name: name, balance: 0 }])
                .select()
                .single();

            if (insertError) throw insertError;
            data = newUser;
        }

        // Update global state — everything downstream reads from currentDbUser
        currentDbUser = data;
        loadBalance();
        loadUserHabit();
        renderHabits();
    } catch (err) {
        console.error("fetchUserProfile error:", err);
    }
}

// Backward-compat alias so any code still calling the old name works
const loadUserProfile = fetchUserProfile;

async function submitTopup() {
    const amountInput = document.getElementById('topup-amount');
    const amount = parseInt(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        alert("Hey, Input valid Top Up nominal!");
        return;
    }

    try {
        await fetchUserProfile();

        if (!currentDbUser) {
            alert("User data not found. Try saving your name and number in settings (⚙️)!");
            return;
        }

        const currentBalance = parseInt(currentDbUser.balance || 0);
        const newBalance = currentBalance + amount;

        const { error } = await supabaseClient
            .from('users')
            .update({ balance: newBalance })
            .eq('phone', localStorage.getItem('buyer_phone'));

        if (error) throw error;

        // Immediately sync local state so loadBalance() shows the new value
        currentDbUser.balance = newBalance;

        // Save top-up history keyed per-user (phone) for true data isolation
        const topupKey = `topup_history_${localStorage.getItem('buyer_phone')}`;
        let topups = JSON.parse(localStorage.getItem(topupKey) || '[]');
        topups.push({ amount: amount, date: Date.now() });
        localStorage.setItem(topupKey, JSON.stringify(topups));

        alert("Top up success! Current Balance: Rp " + newBalance.toLocaleString('id-ID'));

        if (typeof closeTopupModal === 'function') closeTopupModal();
        loadBalance();
    } catch (err) {
        console.error("Topup error:", err);
        alert("Top up failed: " + err.message);
    }
}

async function syncPrice(requestId) {
    const description = document.getElementById(`offer-name-${requestId}`).value;
    const priceField = document.getElementById(`offer-price-${requestId}`);

    let total = autoCalculateTotal(description);

    if (total > 0) {
        priceField.value = total;
    } else if (description.length > 10) {
        const aiPrice = await callGeminiAPI(description);
        if (aiPrice > 0) {
            priceField.value = aiPrice;
        }
    }
}

function autoCalculateTotal(text) {
    const pattern = /(\d+)\s*(?:x|[a-zA-Z\s]+)\s*(\d+)([kK]?)/g;
    let total = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        let qty = parseInt(match[1]);
        let price = parseInt(match[2]);
        let isKilo = match[3].toLowerCase() === 'k';

        if (isKilo) price *= 1000;
        total += (qty * price);
    }
    return total;
}

async function fetchAIPrice(text, targetInput) {
    if (!text) return;

    targetInput.placeholder = "Calculating... ✨";
    targetInput.value = "";

    const apiKey = "AIzaSyC2jrP6grRh7gFOnE8o7UZuhM6k4Zacf7E";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a price extractor. Analyze this food order: '${text}'. Calculate the total price. Return ONLY a JSON object: {"total_price": 12345}. If unclear, return {"total_price": 0}.`;

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await res.json();
        const aiResponse = data.candidates[0].content.parts[0].text;

        const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanJson);

        if (result.total_price && result.total_price > 0) {
            targetInput.value = result.total_price;
            targetInput.style.backgroundColor = "#e8f5e9";
            setTimeout(() => targetInput.style.backgroundColor = "", 1000);
        }
    } catch (e) {
        console.error("AI Error:", e);
    } finally {
        targetInput.placeholder = "Total Price (Rp)";
    }
}

async function handleAutoPriceWithAI(reqId) {
    const nameInput = document.getElementById(`offer-name-${reqId}`);
    const priceInput = document.getElementById(`offer-price-${reqId}`);

    await fetchAIPrice(nameInput.value, priceInput);
}

window.handleAutoPrice = function (reqId) {
    const nameInput = document.getElementById(`offer-name-${reqId}`).value;
    const priceInput = document.getElementById(`offer-price-${reqId}`);

    const calculation = autoCalculateTotal(nameInput);

    if (calculation > 0) {
        priceInput.value = calculation;
        priceInput.style.backgroundColor = "#eff6ff";
        priceInput.style.color = "#1d4ed8";
    } else if (nameInput.length > 10) {
        clearTimeout(window.aiTimeout);
        window.aiTimeout = setTimeout(() => {
            handleAutoPriceWithAI(reqId);
        }, 1200);
    }
}

function openOrderModal() {
    const saved = localStorage.getItem('buyer_address');
    if (saved) {
        document.getElementById('order-address').value = saved;
    }
    document.getElementById('order-modal').classList.add('show');
}

function closeModal() {
    const modal = document.getElementById('order-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function sendRequest(text) {
    const calculatedQty = 1;

    // Combine Name and Last 4 digits of phone
    const buyerName = localStorage.getItem('buyer_name') || "Anonymous";
    const buyerPhone = localStorage.getItem('buyer_phone') || "";
    const phoneSuffix = buyerPhone.length >= 4 ? buyerPhone.slice(-4) : buyerPhone;
    const finalBuyerDisplay = `${buyerName} ${phoneSuffix}`;

    addMessage(`Requesting your order. Waiting for sellers... ⏳`, 'bot');
    auctionContainer = null;

    const { data, error } = await supabaseClient
        .from('requests')
        .insert([{
            user_id: currentDbUser?.id,
            buyer_name: finalBuyerDisplay,
            description: text,
            quantity: calculatedQty
        }])
        .select();

    if (data) {
        currentRequestId = data[0].id;
        startPollingOffers();
    } else {
        addMessage(`Failed to send request. Check connection!`, 'bot');
    }
}

async function loadBalance() {
    try {
        if (currentDbUser && currentDbUser.balance !== undefined) {
            const balanceEl = document.getElementById("user-balance");
            if (balanceEl) balanceEl.innerText = parseInt(currentDbUser.balance).toLocaleString("id-ID");
        }
    } catch (error) {
        console.error("Failed load balance:", error);
    }
}

async function renderHabits() {
    try {
        if (!currentDbUser) return;
        const { data: habits, error } = await supabaseClient
            .from('user_habits')
            .select('*')
            .eq('id', currentDbUser.id)
            .single();

        const box = document.getElementById('habit-box');
        const tags = document.getElementById('habit-tags');

        if (error || !habits || (!habits.avg_price && !habits.last_food && !habits.total_orders)) {
            if (box) box.classList.add('hidden');
            return;
        }

        if (box) box.classList.remove('hidden');
        if (tags) {
            tags.innerHTML = '';
            if (habits.avg_price) {
                tags.innerHTML += `
                    <span class="bg-orange-500 text-white text-sm px-3 py-1 rounded-full font-bold">
                        💰 ~Rp ${Number(habits.avg_price).toLocaleString()}
                    </span>
                `;
            }
            if (habits.last_food) {
                tags.innerHTML += `
                    <span class="bg-white border border-orange-300 text-orange-700
                        text-sm px-3 py-1 rounded-full font-semibold">
                        🍜 ${habits.last_food}
                    </span>
                `;
            }
        }
    } catch (e) {
        console.error("Habit load failed:", e.message);
    }
}

function startPollingOffers() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        const { data: offers, error } = await supabaseClient
            .from('offers')
            .select('*')
            .eq('request_id', currentRequestId)
            .order('price', { ascending: true });

        if (offers && offers.length > 0) {
            renderAuction(offers);
        }
    }, 2000);
}

async function loadUserHabit() {
    try {
        if (!currentDbUser) return;
        const { data: habits, error } = await supabaseClient
            .from('user_habits')
            .select('*')
            .eq('id', currentDbUser.id)
            .single();

        if (habits) {
            userHabit = habits;
            const container = document.getElementById('habit-summary');
            if (container) {
                container.innerHTML = `
                    <div class="text-orange-500 font-bold mb-2">YOUR HABITS</div>
                    <div class="flex gap-2 flex-wrap">
                        <span class="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
                            💰 ~Rp ${Math.round(habits.avg_price).toLocaleString()}
                        </span>
                        <span class="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
                            🍽 ${habits.last_food}
                        </span>
                    </div>
                `;
            }
        }
    } catch (e) {
        console.error("Failed to load habit:", e.message);
        userHabit = null;
    }
}

function renderAuction(offers) {
    if (!auctionContainer) {
        auctionContainer = document.createElement('div');
        auctionContainer.className = 'bot-msg message-bubble w-full';
        auctionContainer.innerHTML = `
            <div class="font-bold mb-3 text-sm flex items-center gap-2" style="color:#FF7A00;">
                <span class="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                🔥 LIVE OFFERS — Choose your best deal!
            </div>
            <div id="auction-list" class="flex flex-col gap-3"></div>
        `;
        chatArea.appendChild(auctionContainer);
    }

    const list = auctionContainer.querySelector('#auction-list');
    list.innerHTML = '';

    let maxScore = 0;
    let minPrice = Infinity;

    offers.forEach(o => {
        const weight = parseInt(o.weight_volume) || 0;
        const price = parseInt(o.price) || 1;
        o.valueScore = weight > 0 ? (weight / (price / 1000)) : 0;
        if (o.valueScore > maxScore) maxScore = o.valueScore;
        if (price < minPrice) minPrice = price;
    });

    offers.forEach((offer) => {
        const price = Number(offer.price);
        const isBestValue = (offer.valueScore === maxScore && maxScore > 0);
        const isCheapest = (price === minPrice);

        // Cheapest gets the golden glow class
        let extraClass = '';
        let badgeHTML = '';

        const stock = offer.stock !== undefined ? parseInt(offer.stock) : 99;
        const isSoldOut = stock <= 0;

        if (isSoldOut) {
            badgeHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:#ef4444;color:white;font-size:10px;font-weight:800;padding:3px 10px;border-radius:999px;margin-top:4px;">🚫 SOLD OUT</span>`;
        } else if (isCheapest && isBestValue) {
            extraClass = 'cheapest-pulse';
            badgeHTML = `<span class="badge-value">⭐ Best Value + Cheapest!</span>`;
        } else if (isCheapest) {
            extraClass = 'cheapest-pulse';
            badgeHTML = `<span class="badge-value">💰 Best Value!</span>`;
        } else if (isBestValue) {
            badgeHTML = `<span style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;font-size:10px;font-weight:800;padding:3px 10px;border-radius:999px;margin-top:4px;">✨ Most Worth It</span>`;
        }

        let mediaHTML = '';
        if (offer.media_url) {
            const isVideo = offer.media_url.match(/\.(mp4|webm|ogg)$/i);
            mediaHTML = isVideo
                ? `<video class="w-full h-36 object-cover rounded-2xl mb-3" muted loop onmouseover="this.play()" onmouseout="this.pause()"><source src="${offer.media_url}" type="video/mp4"></video>`
                : `<img src="${offer.media_url}" class="w-full h-36 object-cover rounded-2xl mb-3" alt="${offer.food_name}" onclick="window.open('${offer.media_url}','_blank')" style="cursor:zoom-in;">`;
        }

        const sellerPhoneLast4 = offer.contact && offer.contact.length >= 4 ? offer.contact.slice(-4) : (offer.contact || '');
        const displaySellerName = `${offer.seller_name} ·${sellerPhoneLast4}`;

        const card = document.createElement('div');
        card.className = `auction-card p-4 flex flex-col gap-1 ${extraClass}`;

        card.innerHTML = `
            ${mediaHTML}
            <div class="flex justify-between items-start gap-2">
                <div class="flex-1">
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                        <i class="fa-solid fa-store" style="color:#0D9488;"></i> ${displaySellerName}
                    </div>
                    <div class="font-bold text-gray-800 text-base mt-0.5">${offer.food_name}</div>
                    <div class="mt-1">${badgeHTML}</div>
                </div>
                <div class="text-right flex flex-col items-end gap-2 flex-shrink-0">
                    <div class="font-bold text-lg" style="color:#FF7A00;">Rp ${price.toLocaleString('id-ID')}</div>
                    <button
                        ${isSoldOut ? 'disabled' : `onclick="openOrder('${offer.seller_name}','${offer.food_name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}','${offer.price}','${offer.contact}','${stock}', ${offer.id})"`}
                        class="text-white text-xs px-5 py-2 rounded-2xl font-bold transition-all shadow-md ${isSoldOut ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'active:scale-95'}"
                        style="${isSoldOut ? '' : 'background:linear-gradient(135deg,#FF7A00,#FF9A3C);box-shadow:0 4px 14px rgba(255,122,0,0.4);'}">
                        ${isSoldOut ? 'Sold Out' : 'Choose'}
                    </button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

// Media Preview Function for Seller
window.previewMedia = function (input, reqId) {
    const previewContainer = document.getElementById(`media-preview-${reqId}`);
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            previewContainer.innerHTML = `<img src="${e.target.result}" class="h-16 w-16 object-cover rounded border border-blue-200 mt-2 shadow-sm">`;
            previewContainer.classList.remove('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    } else {
        previewContainer.innerHTML = '';
        previewContainer.classList.add('hidden');
    }
}

async function loadSellerRequests() {
    const sellerRequestsList = document.getElementById('seller-requests');
    if (!sellerRequestsList) return;

    // Prevents the list from refreshing while you are typing an offer
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT') && sellerRequestsList.contains(activeEl)) {
        return;
    }

    try {
        const { data: requests, error } = await supabaseClient
            .from('requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        sellerRequestsList.innerHTML = '';

        if (!requests || requests.length === 0) {
            sellerRequestsList.innerHTML = '<div class="text-center text-gray-400 mt-10 italic">No active requests yet...</div>';
            return;
        }

        // --- THE FIX: Pull specific Seller data from storage ---
        const savedSellerName = localStorage.getItem('seller_name') || 'Not Set';
        const savedSellerPhone = localStorage.getItem('seller_phone') || 'Not Set';

        const profileSet = isProfileSet();
        const disableAttr = profileSet ? '' : 'disabled';
        const opacityCls = profileSet ? '' : 'opacity-50 cursor-not-allowed';

        requests.forEach(req => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-xl shadow-sm border border-blue-100 mb-2';
            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <span class="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 w-max">
                            <i class="fa-solid fa-user"></i> ${req.buyer_name} requested:
                        </span>
                        <p class="font-bold text-gray-800 text-lg mt-1">"${req.description}"</p>
                    </div>
                </div>
                
                <div class="bg-slate-50 p-3 rounded-lg border border-blue-50 text-sm">
                    
                    <div class="flex gap-2 mb-2">
                        <input type="text" id="offer-name-${req.id}" 
                            placeholder="Ex: Nasi Goreng Special" 
                            oninput="window.handleAutoPrice(${req.id})"
                            ${disableAttr}
                            class="w-2/3 p-2 rounded border outline-none focus:border-blue-500 ${opacityCls}">
                        
                        <input type="text" id="offer-size-${req.id}" 
                            placeholder="Size/Notes" 
                            ${disableAttr}
                            class="w-1/3 p-2 rounded border outline-none focus:border-blue-500 bg-white ${opacityCls}">
                    </div>
                    
                    <div class="flex gap-2 mb-2">
                        <div class="w-1/2">
                            <label class="text-[9px] text-gray-400 uppercase font-bold">Selling as:</label>
                            <input type="text" id="offer-seller-${req.id}" value="${savedSellerName}" readonly class="w-full p-2 rounded border bg-gray-100 text-gray-500 text-xs ${opacityCls}"/>
                        </div>
                        <div class="w-1/2">
                            <label class="text-[9px] text-gray-400 uppercase font-bold">WA Contact:</label>
                            <input type="text" id="offer-contact-${req.id}" value="${savedSellerPhone}" readonly class="w-full p-2 rounded border bg-gray-100 text-gray-500 text-xs ${opacityCls}"/>
                        </div>
                    </div>
                    
                    <div class="flex gap-2 mb-2">
                        <input type="number" id="offer-price-${req.id}" placeholder="Price (Rp)" ${disableAttr} class="w-1/2 p-2 rounded border border-blue-200 bg-blue-50 font-bold text-blue-700 ${opacityCls}">
                        <input type="number" id="offer-stock-${req.id}" placeholder="Qty" value="1" ${disableAttr} class="w-1/2 p-2 rounded border focus:border-orange-500 ${opacityCls}">
                    </div>

                    <div class="mb-3">
                        <label class="text-xs font-bold text-gray-500 mb-1 block">Upload Photo</label>
                        <input type="file" id="offer-media-${req.id}" accept="image/*,video/*" ${disableAttr} class="w-full text-xs text-gray-500 ${opacityCls}" onchange="previewMedia(this, ${req.id})">
                        <div id="media-preview-${req.id}" class="mt-2 hidden"></div>
                    </div>

                    <button id="submit-btn-${req.id}" onclick="${profileSet ? `submitOffer(${req.id})` : `checkProfile()`}" class="w-full bg-blue-600 text-white font-bold py-2 rounded-lg transition-colors shadow-sm ${profileSet ? 'hover:bg-blue-700' : 'opacity-50 cursor-not-allowed'}">
                        ${profileSet ? 'Submit Offer' : 'Profile Setup Required'}
                    </button>
                </div>
            `;
            sellerRequestsList.appendChild(card);
        });

    } catch (err) {
        console.error("Error loading requests:", err);
    }
}

async function submitOffer(reqId) {
    if (!checkProfile()) return;

    // 1. Ambil input yang MEMANG diketik seller (Menu & Harga)
    const foodName = document.getElementById(`offer-name-${reqId}`).value;
    const price = document.getElementById(`offer-price-${reqId}`).value;
    const stockVal = parseInt(document.getElementById(`offer-stock-${reqId}`).value) || 1;
    const mediaFile = document.getElementById(`offer-media-${reqId}`).files[0];
    const btn = document.getElementById(`submit-btn-${reqId}`);

    // 2. AMBIL OTOMATIS dari Local Storage (Biar gak usah ngetik lagi)
    const sellerName = localStorage.getItem('seller_name');
    const contact = localStorage.getItem('seller_phone');

    // Validasi dasar
    if (!foodName || !price) {
        return alert("Isi nama makanan dan harga dulu ya!");
    }

    let finalMediaUrl = "";

    // 3. LOGIKA UPLOAD GAMBAR (Punya kamu yang canggih itu)
    if (mediaFile) {
        btn.innerText = "Uploading Media... ⏳";
        btn.disabled = true;

        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('offer_media')
            .upload(fileName, mediaFile, { upsert: false });

        if (uploadError) {
            alert("Gagal upload gambar: " + uploadError.message);
            btn.innerText = "Kirim Penawaran";
            btn.disabled = false;
            return;
        }

        const { data } = supabaseClient.storage.from('offer_media').getPublicUrl(fileName);
        finalMediaUrl = data.publicUrl;
    }

    // 4. KIRIM KE SUPABASE
    btn.innerText = "Submitting... ✨";

    const { error: insertError } = await supabaseClient.from('offers').insert([{
        request_id: reqId,
        seller_name: sellerName, // DIAMBIL DARI MEMORI
        food_name: foodName,
        price: parseInt(price),
        stock: stockVal,
        contact: contact,       // DIAMBIL DARI MEMORI
        media_url: finalMediaUrl
    }]);

    if (!insertError) {
        alert("Offer successfully sent!");
        loadSellerRequests(); // Refresh list
    } else {
        alert("Error: " + insertError.message);
    }

    btn.innerText = "Send Offer";
    btn.disabled = false;
}

function addMessage(text, sender) {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = sender === "bot" ? "flex justify-start mb-4" : "flex justify-end mb-4";

    const bubbleClass = sender === "bot"
        ? "bg-orange-100 text-orange-800 rounded-tl-none border-orange-200"
        : "bg-orange-600 text-white rounded-tr-none border-transparent";

    msgDiv.innerHTML = `
        <div class="${bubbleClass} p-4 rounded-2xl shadow-sm max-w-[80%] border">
            <p class="text-sm font-medium">${text}</p>
        </div>
    `;

    chatArea.appendChild(msgDiv);
}

async function saveUserHabit(food, price, isCheapest) {
    if (!currentDbUser) return;
    try {
        const { data: habit } = await supabaseClient
            .from('user_habits')
            .select('*')
            .eq('id', currentDbUser.id)
            .single();

        let newTotalOrders = (habit?.total_orders || 0) + 1;
        let newCheapestCount = (habit?.cheapest_count || 0) + (isCheapest ? 1 : 0);
        let prevAvg = habit?.avg_price || price;
        let newAvg = ((prevAvg * (newTotalOrders - 1)) + price) / newTotalOrders;

        const payload = {
            id: currentDbUser.id,
            last_food: food,
            avg_price: newAvg,
            total_orders: newTotalOrders,
            cheapest_count: newCheapestCount
        };

        await supabaseClient.from('user_habits').upsert([payload]);

    } catch (err) {
        console.error("Save habit failed:", err);
    }
}

function openHistoryModal() {
    const modal = document.getElementById("history-modal");
    modal.classList.add("active");
    document.body.classList.add("modal-open");
    loadOrderHistory();
}

function closeHistoryModal() {
    const modal = document.getElementById("history-modal");
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
}

function openOrder(seller, food, price, contact, maxStock, offerId) {
    currentOrderContext = { seller, food, price, contact, maxStock, offerId };
    const modal = document.getElementById('order-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('modal-seller-name').innerText = '🏪 ' + seller;
    document.getElementById('modal-food-name').innerText = food;
    document.getElementById('modal-price').innerText = 'Rp ' + Number(price).toLocaleString('id-ID');

    const qtyInput = document.getElementById('order-qty');
    const stock = parseInt(maxStock) || 99;
    qtyInput.min = 1;
    qtyInput.max = stock;
    qtyInput.value = 1;

    const totalBox = document.getElementById('order-total');

    // Recalculate total on every keystroke/stepper click
    const updateTotal = () => {
        let qty = parseInt(qtyInput.value) || 1;
        // Cap to stock in real-time; show toast if user typed too high
        if (qty > stock) {
            qty = stock;
            qtyInput.value = stock;
            showToast('Whoa, easy there!', `Only ${stock} item(s) left in stock.`, 'error', 3000);
        }
        if (qty < 1) { qty = 1; qtyInput.value = 1; }
        totalBox.innerText = 'Total: Rp ' + (qty * Number(price)).toLocaleString('id-ID');
    };
    updateTotal();
    qtyInput.oninput = updateTotal;

    // Pre-fill buyer name
    const savedName = localStorage.getItem('buyer_name');
    if (savedName) document.getElementById('buyer-name').value = savedName;

    // Pre-fill & show buyer phone (read-only display)
    const savedPhone = localStorage.getItem('buyer_phone') || '';
    const phoneEl = document.getElementById('buyer-phone-display');
    if (phoneEl) phoneEl.value = savedPhone;

    // Pre-fill saved address
    const savedAddr = localStorage.getItem('buyer_address');
    if (savedAddr) document.getElementById('order-address').value = savedAddr;

    initDeliveryMap();
}

async function submitOrder() {
    if (!checkProfile()) return;
    if (!currentDbUser) return showToast('Hold on!', 'Set up your profile first via the ⚙️ icon.', 'error');
    const { seller, food, price, contact, maxStock } = currentOrderContext;
    const stock = parseInt(maxStock) || 99;

    // Read qty fresh from the DOM — this is the single source of truth
    let qty = parseInt(document.getElementById('order-qty').value);
    if (!qty || qty < 1) qty = 1;
    if (qty > stock) {
        qty = stock;
        document.getElementById('order-qty').value = stock;
        showToast('Adjusted for you!', `Capped at ${stock} (max stock).`, 'default', 3000);
    }
    // Debug trace — visible in DevTools console
    console.log('[submitOrder] qty:', qty, '| stock:', stock);

    const total = qty * Number(price);
    const buyerName = document.getElementById('buyer-name').value.trim();
    const address = document.getElementById('order-address').value.trim();
    // Use the EXACT same string that is stored in localStorage
    // so loadOrderHistory's .eq('buyer_name', ...) query always matches.
    const buyerPhone = localStorage.getItem('buyer_phone') || '';
    const storedName = localStorage.getItem('buyer_name') || buyerName;

    if (!buyerName) return showToast("What's your name?", 'We need your name so the seller knows who to deliver to.', 'error');
    if (!address) return showToast('Drop a pin or type your address!', "Sellers can't deliver to nowhere 😟", 'error');
    if (currentDbUser.balance < total) {
        return showToast('Not enough balance 💸', `You need Rp ${total.toLocaleString('id-ID')} but your wallet is short. Top up first!`, 'error');
    }

    const btn = document.getElementById('submit-order-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Placing order…'; }

    // --- ESCROW: Deduct balance immediately on Place Order ---
    const newBalance = currentDbUser.balance - total;
    const { error: balErr } = await supabaseClient
        .from('users')
        .update({ balance: newBalance })
        .eq('id', currentDbUser.id);

    if (balErr) {
        if (btn) { btn.disabled = false; btn.textContent = '🛵 Place Order'; }
        return showToast('Payment failed', balErr.message, 'error');
    }
    currentDbUser.balance = newBalance;
    loadBalance();

    // Normalise contact to international format
    let cleanContact = (contact || '').replace(/\D/g, '');
    if (cleanContact.startsWith('0')) cleanContact = '62' + cleanContact.slice(1);

    // buyer_name stored as the EXACT localStorage value (e.g. "Budi 5678")
    // so history queries with .eq('buyer_name', storedName) always match.
    const { error: orderErr } = await supabaseClient.from('orders').insert([{
        request_id: currentRequestId,
        user_id: currentDbUser.id,    // <-- Required for refund logic
        buyer_name: storedName,          // <-- exact match with history query
        buyer_phone: buyerPhone,          // <-- NEW: explicitly saved for refunds
        buyer_address: address,
        seller_name: seller,
        food_name: food,
        price: parseInt(price),
        quantity: qty,                 // <-- user-selected qty
        total: total,               // <-- price * qty
        contact: cleanContact
    }]);

    if (btn) { btn.disabled = false; btn.textContent = '🛵 Place Order'; }

    if (!orderErr && currentOrderContext.offerId) {
        // Decrement stock
        const newStock = Math.max(0, stock - qty);
        await supabaseClient.from('offers').update({ stock: newStock }).eq('id', currentOrderContext.offerId);
    }

    if (!orderErr) {
        saveUserHabit(food, price, false);
        closeModal();
        showToast('Order is live! 🎉', `${food} ×${qty} from ${seller} — Rp ${total.toLocaleString('id-ID')}. Hang tight!`, 'buyer', 7000);
        localStorage.setItem('buyer_address', address);
    } else {
        // If order insert failed, refund the balance
        currentDbUser.balance += total;
        await supabaseClient.from('users').update({ balance: currentDbUser.balance }).eq('id', currentDbUser.id);
        loadBalance();
        showToast('Something went wrong 😕', orderErr.message + ' (balance refunded)', 'error');
    }
}


function statusBadge(status) {
    const map = {
        'pending': ['⏳', 'Pending', 'bg-yellow-100 text-yellow-700'],
        'on process': ['🍳', 'On Process', 'bg-blue-100 text-blue-700'],
        'delivered': ['✅', 'Delivered', 'bg-green-100 text-green-700'],
        'cancelled': ['🚫', 'Cancelled', 'bg-red-100 text-red-700']
    };
    const [icon, label, cls] = map[status] || ['❓', status, 'bg-gray-100 text-gray-600'];
    return `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}">${icon} ${label}</span>`;
}

async function loadOrderHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center text-gray-400 py-6"><div class="text-3xl">⏳</div><div class="mt-2 text-sm">Loading…</div></div>';
    try {
        // buyer_name in the DB is the exact localStorage value (e.g. "Budi 5678").
        // We try the stored name first, then fall back to a phone-suffix partial match
        // to catch any rows written by older code variants.
        const storedBuyerName = localStorage.getItem('buyer_name') || '';
        const buyerPhone = localStorage.getItem('buyer_phone') || '';
        const phoneSuffix = buyerPhone.slice(-4);

        // Primary query: exact name match
        let { data: orders } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('buyer_name', storedBuyerName)
            .order('created_at', { ascending: false });

        // Fallback: if nothing found and we have a phone suffix, try ilike match
        // This catches rows written as "Name (5678)" by older code
        if ((!orders || orders.length === 0) && phoneSuffix) {
            const { data: fallback } = await supabaseClient
                .from('orders')
                .select('*')
                .ilike('buyer_name', `%${phoneSuffix}%`)
                .order('created_at', { ascending: false });
            if (fallback && fallback.length > 0) orders = fallback;
        }

        // Top-up history from localStorage, keyed per phone
        const topupKey = `topup_history_${buyerPhone}`;
        const topups = JSON.parse(localStorage.getItem(topupKey) || '[]');
        let allHistory = [];
        let totalSpend = 0;

        (orders || []).forEach(o => allHistory.push({ type: 'buy', order: o, date: new Date(o.created_at).getTime() }));
        topups.forEach(t => allHistory.push({ type: 'topup', amount: t.amount, date: t.date }));
        allHistory.sort((a, b) => b.date - a.date);

        listEl.innerHTML = '';
        if (!allHistory.length) {
            listEl.innerHTML = '<div class="text-center text-gray-400 mt-8 italic"><div class="text-3xl mb-2">🛒</div>Nothing here yet. Go order something delicious!</div>';
            return;
        }

        allHistory.forEach(item => {
            const el = document.createElement('div');
            el.className = 'p-4 rounded-2xl border border-gray-100 bg-white shadow-sm flex flex-col gap-2 hover:shadow-md transition-all';

            if (item.type === 'buy') {
                const o = item.order;
                if (o.status !== 'cancelled') {
                    totalSpend += (o.total || 0);
                }
                const dateStr = new Date(o.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                el.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center text-lg flex-shrink-0">🍽️</div>
                            <div>
                                <div class="font-bold text-sm text-gray-800">${o.food_name}</div>
                                <div class="text-[10px] text-gray-400">${o.seller_name} • ${o.quantity} item${o.quantity > 1 ? 's' : ''} • ${dateStr}</div>
                            </div>
                        </div>
                        <div class="text-right flex-shrink-0 ml-2">
                            <div class="font-bold text-red-500 text-sm">- Rp ${(o.total || 0).toLocaleString('id-ID')}</div>
                            <div class="mt-1">${statusBadge(o.status || 'pending')}</div>
                        </div>
                    </div>
                    ${(o.status === 'pending' || !o.status) ? `
                    <div class="mt-3 flex justify-end">
                        <button onclick="cancelOrder(${o.id})" class="px-4 py-1.5 rounded-xl text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-all border border-red-100">
                            <i class="fa-solid fa-ban"></i> Cancel Order
                        </button>
                    </div>` : ''}`;
            } else {
                const dateStr = new Date(item.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                el.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-green-50 flex items-center justify-center text-lg flex-shrink-0">💳</div>
                            <div>
                                <div class="font-bold text-sm text-gray-800">Top Up Balance</div>
                                <div class="text-[10px] text-gray-400">${dateStr}</div>
                            </div>
                        </div>
                        <div class="font-bold text-green-600 text-sm">+ Rp ${item.amount.toLocaleString('id-ID')}</div>
                    </div>`;
            }
            listEl.appendChild(el);
        });

        const totalEl = document.getElementById('total-spend');
        if (totalEl) totalEl.innerText = `Rp ${totalSpend.toLocaleString('id-ID')}`;

    } catch (err) {
        console.error('loadOrderHistory error:', err);
        listEl.innerHTML = '<div class="text-center text-red-400 mt-4">Couldn’t load history. Try again?</div>';
    }
}

async function cancelOrder(orderId) {
    if (!confirm("Are you sure you want to cancel/reject this order?")) return;

    // First fetch the order to get the total and buyer_phone
    const { data: orderData, error: fetchErr } = await supabaseClient
        .from('orders')
        .select('total, buyer_phone, status, quantity, request_id, seller_name, food_name')
        .eq('id', orderId)
        .single();

    if (fetchErr || !orderData) {
        return showToast('Cancel failed', 'Order not found or missing buyer info.', 'error');
    }

    if (orderData.status !== 'pending' && orderData.status) {
        return showToast('Too late!', 'This order is already being processed or delivered.', 'error');
    }

    const btn = event?.currentTarget;
    if (btn) { btn.disabled = true; btn.innerText = 'Cancelling...'; }

    // Refund logic: MUST happen BEFORE setting status to cancelled
    if (orderData.buyer_phone) {
        // Fetch current user balance by phone
        const { data: user, error: userErr } = await supabaseClient
            .from('users')
            .select('id, balance')
            .eq('phone', orderData.buyer_phone)
            .single();

        if (!userErr && user) {
            const refundedBalance = parseInt(user.balance || 0) + parseInt(orderData.total || 0);

            // Increment the buyer's balance
            const { error: refundErr } = await supabaseClient
                .from('users')
                .update({ balance: refundedBalance })
                .eq('id', user.id);

            if (refundErr) {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancel/Reject'; }
                return showToast('Refund failed', refundErr.message, 'error');
            }

            // If currentDbUser is the one cancelling (Buyer), update local state
            if (currentDbUser && currentDbUser.id === user.id) {
                currentDbUser.balance = refundedBalance;
                loadBalance();
            }
        }
    }

    // Now update status to cancelled
    const { error: cancelErr } = await supabaseClient
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

    if (cancelErr) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-ban"></i> Cancel/Reject'; }
        return showToast('Cancel failed', cancelErr.message, 'error');
    }

    // Refund Stock
    if (orderData.request_id && orderData.seller_name && orderData.food_name) {
        const { data: offerData } = await supabaseClient
            .from('offers')
            .select('id, stock')
            .eq('request_id', orderData.request_id)
            .eq('seller_name', orderData.seller_name)
            .eq('food_name', orderData.food_name)
            .single();

        if (offerData) {
            const restoredStock = (offerData.stock || 0) + (orderData.quantity || 1);
            await supabaseClient.from('offers').update({ stock: restoredStock }).eq('id', offerData.id);
        }
    }

    showToast('Order Cancelled 🚫', 'The money has been refunded to the buyer.', 'success');

    // Refresh the view depending on who cancelled
    if (typeof isSellerPage !== 'undefined' && isSellerPage) {
        loadSellerHistory();
    } else {
        loadOrderHistory();
    }
}

/* ── SELLER NOTIFICATION COUNTER ── */
let sellerNotifCount = 0;
function incrementSellerNotif() {
    sellerNotifCount++;
    const badge = document.getElementById('new-order-badge');
    if (!badge) return;
    badge.classList.remove('hidden');
    badge.innerHTML = `<i class="fa-solid fa-bell"></i> ${sellerNotifCount} New Order${sellerNotifCount > 1 ? 's' : ''}!`;
}
function clearSellerNotif() {
    sellerNotifCount = 0;
    const badge = document.getElementById('new-order-badge');
    if (badge) badge.classList.add('hidden');
}

/* ── SELLER HISTORY / ACTIVE ORDERS ── */
function openSellerHistory() {
    const modal = document.getElementById('seller-history-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        loadSellerHistory();
        clearSellerNotif(); // Clear badge when seller opens the dashboard
    }
}
function closeSellerHistory() {
    const modal = document.getElementById('seller-history-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

async function loadSellerHistory() {
    const listEl = document.getElementById('seller-history-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center text-gray-400 py-6"><div class="text-3xl">📊</div><div class="mt-2 text-sm">Loading your orders…</div></div>';
    const sellerName = localStorage.getItem('seller_name');
    if (!sellerName) {
        listEl.innerHTML = '<div class="text-center text-gray-400 mt-8">Set up your shop first via ⚙️</div>';
        return;
    }
    try {
        // Filter by seller_name (column that exists in the schema)
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('seller_name', sellerName)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const today = new Date().toDateString();
        let todayEarnings = 0;
        const active = (orders || []).filter(o => (o.status || 'pending') !== 'delivered' && o.status !== 'cancelled');
        const completed = (orders || []).filter(o => (o.status || 'pending') === 'delivered');
        const cancelled = (orders || []).filter(o => o.status === 'cancelled');

        listEl.innerHTML = '';

        // ── ACTIVE ORDERS section ──
        if (active.length > 0) {
            const header = document.createElement('div');
            header.className = 'text-xs font-bold uppercase tracking-wider text-teal-600 mb-2 mt-1 flex items-center gap-1';
            header.innerHTML = `<span class="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse"></span> Active Orders (${active.length})`;
            listEl.appendChild(header);
        }

        active.forEach(o => {
            if (new Date(o.created_at).toDateString() === today) todayEarnings += (o.total || 0);
            const el = document.createElement('div');
            el.className = 'p-4 rounded-2xl border-2 border-teal-100 bg-teal-50/40 shadow-sm mb-3';
            el.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-sm text-gray-800">${o.food_name}</div>
                        <div class="text-[11px] text-gray-500 mt-0.5">👤 ${o.buyer_name} • qty ${o.quantity}</div>
                        <div class="text-[11px] text-gray-400">📍 ${o.buyer_address || 'No address given'}</div>
                    </div>
                    <div class="text-right flex-shrink-0 ml-2">
                        <div class="font-bold text-teal-600 text-sm">+ Rp ${(o.total || 0).toLocaleString('id-ID')}</div>
                        <div class="mt-1">${statusBadge(o.status || 'pending')}</div>
                    </div>
                </div>
                <div class="flex gap-2 mt-3">
                    ${(o.status || 'pending') === 'pending' ? `
                        <button onclick="cancelOrder(${o.id})"
                            class="flex-[0.5] py-2 rounded-xl text-xs font-bold text-red-500 transition-all active:scale-95"
                            style="background:rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);">
                            <i class="fa-solid fa-ban"></i> Reject
                        </button>
                        <button onclick="updateOrderStatus(${o.id}, 'on process')"
                            class="flex-[1.5] py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                            style="background:rgba(13,148,136,0.12);color:#0D9488;">
                            🍳 Start Cooking
                        </button>` : ''}
                    <button onclick="updateOrderStatus(${o.id}, 'delivered')"
                        class="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                        style="background:linear-gradient(135deg,#0D9488,#14B8A6);box-shadow:0 4px 12px rgba(13,148,136,0.3);">
                        🛵 Mark as Delivered
                    </button>
                </div>`;
            listEl.appendChild(el);
        });

        // ── COMPLETED section ──
        if (completed.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 mt-4 flex items-center gap-1';
            divider.innerHTML = `✅ Delivered (${completed.length})`;
            listEl.appendChild(divider);
        }

        completed.forEach(o => {
            if (new Date(o.created_at).toDateString() === today) todayEarnings += (o.total || 0);
            const el = document.createElement('div');
            el.className = 'p-3 rounded-2xl border border-gray-100 bg-white shadow-sm mb-2 opacity-70';
            el.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <div class="font-semibold text-sm text-gray-700">${o.food_name}</div>
                        <div class="text-[10px] text-gray-400">${o.buyer_name} • qty ${o.quantity}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-green-600 text-sm">+ Rp ${(o.total || 0).toLocaleString('id-ID')}</div>
                        <div class="mt-1">${statusBadge('delivered')}</div>
                    </div>
                </div>`;
            listEl.appendChild(el);
        });

        // ── CANCELLED section ──
        if (cancelled.length > 0) {
            const divCancel = document.createElement('div');
            divCancel.className = 'text-xs font-bold uppercase tracking-wider text-red-400 mb-2 mt-4 flex items-center gap-1';
            divCancel.innerHTML = `🚫 Cancelled (${cancelled.length})`;
            listEl.appendChild(divCancel);
        }

        cancelled.forEach(o => {
            const el = document.createElement('div');
            el.className = 'p-3 rounded-2xl border border-red-50 bg-red-50/30 shadow-sm mb-2 opacity-70';
            el.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <div class="font-semibold text-sm text-gray-700 line-through decoration-red-300">${o.food_name}</div>
                        <div class="text-[10px] text-gray-400">${o.buyer_name} • qty ${o.quantity}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-gray-400 text-sm">Rp ${(o.total || 0).toLocaleString('id-ID')}</div>
                        <div class="mt-1">${statusBadge('cancelled')}</div>
                    </div>
                </div>`;
            listEl.appendChild(el);
        });

        if (!orders?.length) {
            listEl.innerHTML = '<div class="text-center text-gray-400 mt-8 italic"><div class="text-3xl mb-2">👀</div>No orders yet. Offers are out there — keep going!</div>';
        }

        const totalEl = document.getElementById('seller-today-total');
        if (totalEl) totalEl.innerText = `Rp ${todayEarnings.toLocaleString('id-ID')}`;
    } catch (e) {
        listEl.innerHTML = '<div class="text-center text-red-400 mt-4">Couldn’t load orders. Try again?</div>';
    }
}

async function updateOrderStatus(orderId, newStatus) {
    const { error } = await supabaseClient.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (!error) {
        const msgs = {
            'on process': ['Cooking time! 🍳', 'Order marked as On Process. The buyer knows you’re on it.'],
            'delivered': ['Delivered! 🚀', 'Nice work! Order is marked as delivered. Time to get paid.']
        };
        const [title, msg] = msgs[newStatus] || ['Updated!', `Status set to ${newStatus}.`];
        showToast(title, msg, 'success', 5000);
        loadSellerHistory();
    } else {
        showToast('Update failed 😕', error.message, 'error');
    }
}

/* ── SUPABASE REALTIME: Listen for order updates ── */
function initOrderRealtime() {
    const isSeller = typeof isSellerPage !== 'undefined' && isSellerPage;
    const sellerName = localStorage.getItem('seller_name');
    const buyerPhone = localStorage.getItem('buyer_phone');
    const storedBuyerName = localStorage.getItem('buyer_name');

    if (!sellerName && !buyerPhone) return;

    supabaseClient
        .channel('order-updates')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            (payload) => {
                const o = payload.new || payload.old;

                // Seller-side events
                if (isSeller && o.seller_name === sellerName) {
                    if (payload.eventType === 'INSERT') {
                        incrementSellerNotif();
                        showToast(
                            '🛵 New Order Coming In!',
                            `${o.food_name} ×${o.quantity} — ${o.buyer_name} just placed an order. Go get it!`,
                            'seller',
                            9000
                        );
                        if (document.getElementById('history-list')) loadSellerHistory();
                    } else if (payload.eventType === 'UPDATE') {
                        if (o.status === 'cancelled') {
                            showToast('Order Cancelled 🚫', `${o.buyer_name} cancelled their order.`, 'error', 5000);
                        }
                        if (document.getElementById('history-list')) loadSellerHistory();
                    }
                }
                // Buyer-side events
                else if (!isSeller && (o.buyer_phone === buyerPhone || o.buyer_name === storedBuyerName)) {
                    if (payload.eventType === 'UPDATE') {
                        if (o.status === 'on process') {
                            showToast('Cooking time! 🍳', `${o.seller_name} is preparing your ${o.food_name}.`, 'buyer', 5000);
                        } else if (o.status === 'delivered') {
                            showToast('Delivered! 🚀', `Your ${o.food_name} has arrived!`, 'success', 5000);
                        } else if (o.status === 'cancelled') {
                            showToast('Order Rejected 🚫', `${o.seller_name} rejected your order. Money refunded.`, 'error', 5000);
                            loadBalance(); // Refresh balance in header
                        }
                        if (document.getElementById('history-list')) loadOrderHistory();
                    }
                }
            }
        )
        .subscribe();
}

function openTopupModal() {
    const modal = document.getElementById("topup-modal");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
}

function closeTopupModal() {
    const modal = document.getElementById("topup-modal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
}

document.addEventListener('DOMContentLoaded', async () => {
    updateGatekeeperUI();
    const phone = (typeof isSellerPage !== 'undefined' && isSellerPage) ? localStorage.getItem('seller_phone') : localStorage.getItem('buyer_phone');
    if (phone) await fetchUserProfile();

    initOrderRealtime();

    const UserInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const chatAreaEl = document.getElementById('chat-area');

    if (UserInput && sendBtn) {
        let processing = false;
        const handleSendClick = (e) => {
            if (e) e.preventDefault();
            if (processing) return;
            const val = UserInput.value.trim();
            if (!val) return;
            processing = true;
            UserInput.value = '';
            addMessage(val, 'user');
            if (!checkProfile()) { processing = false; return; }
            if (typeof sendRequest === 'function') sendRequest(val);
            setTimeout(() => { processing = false; }, 500);
        };
        sendBtn.onclick = handleSendClick;
        UserInput.onkeydown = (e) => { if (e.key === 'Enter') handleSendClick(e); };
        if (chatAreaEl && !chatAreaEl.innerHTML.trim()) {
            setTimeout(() => addMessage("What are you craving? 😋 Tell me and watch sellers compete!", 'bot'), 350);
        }
    }

    const sellerListEl = document.getElementById('seller-requests');
    if (sellerListEl) {
        loadSellerRequests();
        setInterval(loadSellerRequests, 5000);
    }
});

// BIND ALL GLOBALS
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.openOrder = openOrder;
window.closeModal = closeModal;
window.chooseAddress = chooseAddress;
window.openTopupModal = openTopupModal;
window.closeTopupModal = closeTopupModal;
window.openConfig = openConfig;
window.saveConfig = saveConfig;
window.submitTopup = submitTopup;
window.submitOffer = submitOffer;
window.submitOrder = submitOrder;
window.handleSend = handleSend;
window.changeQty = changeQty;
window.locateMeOnMap = locateMeOnMap;
window.openSellerHistory = openSellerHistory;
window.closeSellerHistory = closeSellerHistory;
window.updateOrderStatus = updateOrderStatus;
window.showToast = showToast;