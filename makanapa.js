// --- CONFIGURATION ---
const supabaseUrl = 'https://ujndksyjogxnhlgaezuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbmRrc3lqb2d4bmhsZ2FlenV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNTM4NzUsImV4cCI6MjA5MTcyOTg3NX0.JmWTrUlAagv9Ae0NHwSaX3T8sN0OaQkbsQiJYs7OwJU';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Check if we are on the Seller Page or Buyer Page
const isSellerPage = document.body.classList.contains('seller-theme');

// --- CONFIGURATION CHECK LOGIC ---
function checkConfig() {
    if (isSellerPage) {
        if (!localStorage.getItem('seller_phone') || !localStorage.getItem('seller_name')) {
            alert("Shop settings missing! Please click the ⚙️ icon to fill in your Shop Name & WhatsApp Number.");
            if (typeof openConfig === 'function') openConfig();
            return false;
        }
    } else {
        if (!localStorage.getItem('buyer_phone') || !localStorage.getItem('buyer_name')) {
            alert("Oops! Please click the ⚙️ icon to fill in your Name & Phone Number first.");
            if (typeof openConfig === 'function') openConfig();
            return false;
        }
    }
    return true;
}

function openConfig() {
    const modal = document.getElementById('auth-modal');

    // Ambil nama sesuai halaman
    const savedName = isSellerPage ? localStorage.getItem('seller_name') : localStorage.getItem('buyer_name');
    const savedPhone = isSellerPage ? localStorage.getItem('seller_phone') : localStorage.getItem('buyer_phone');

    const nameInput = document.getElementById('auth-name');
    const phoneInput = document.getElementById('auth-phone');

    if (nameInput) nameInput.value = savedName || '';
    if (phoneInput) phoneInput.value = savedPhone || '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function saveConfig() {
    const nameInput = document.getElementById('auth-name');
    const phoneInput = document.getElementById('auth-phone');
    let name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!name || !phone) {
        alert('Tolong isi nama dan nomor HP dulu ya!');
        return;
    }

    // --- AUTO GENERATE ID (Budi 1107) ---
    const suffix = phone.slice(-4); // Ambil 4 angka terakhir nomor HP
    if (!name.endsWith(suffix)) {
        name = `${name} ${suffix}`;
        nameInput.value = name; // Update biar kelihatan di input
    }

    // --- SIMPAN TERPISAH (Biar Auxil & Budi gak berantem) ---
    if (isSellerPage) {
        localStorage.setItem('seller_name', name);
        localStorage.setItem('seller_phone', phone);
    } else {
        localStorage.setItem('buyer_name', name);
        localStorage.setItem('buyer_phone', phone);
    }

    // Simpan phone umum untuk login/cek config
    localStorage.setItem('user_phone', phone);

    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    alert("Profil Berhasil Disimpan!");
}

// State
let currentRequestId = null;
let pollingInterval = null;
let auctionContainer = null;
let userHabit = null;
let currentUser = null;
let currentDbUser = null;
let isProcessing = false;

// UI Elements
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');

const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!checkConfig()) return;
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

async function loadUserProfile() {
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
            const { data: newUser, error: insertError } = await supabaseClient
                .from('users')
                .insert([{ phone: phone, name: name, balance: 0 }])
                .select()
                .single();

            if (insertError) throw insertError;
            data = newUser;
        }

        currentDbUser = data;
        loadBalance();
        loadUserHabit();
        renderHabits();
    } catch (err) {
        console.error("Profile Error:", err);
    }
}

async function submitTopup() {
    const amountInput = document.getElementById('topup-amount');
    const amount = parseInt(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        alert("Hey, Input valid Top Up nominal!");
        return;
    }

    try {
        await loadUserProfile();

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

        // Save top-up history to localStorage
        let topups = JSON.parse(localStorage.getItem('topup_history') || '[]');
        topups.push({ amount: amount, date: Date.now() });
        localStorage.setItem('topup_history', JSON.stringify(topups));

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
            <div class="font-bold text-orange-600 mb-2 text-sm flex items-center gap-2">
                <span class="animate-pulse text-red-500">●</span> 🔥 LIVE OFFERS
            </div>
            <div id="auction-list" class="flex flex-col gap-2"></div>
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

        let cardStyle = 'border border-gray-100 bg-white opacity-90';
        let badgeHTML = '';

        if (isBestValue && isCheapest) {
            cardStyle = 'border-2 border-green-500 bg-green-50 shadow-md transform scale-[1.02] transition-transform animate-[pulse_2s_ease-in-out_infinite]';
            badgeHTML = `<div class="text-[10px] font-bold text-green-600 mt-1 flex items-center gap-1">✨ MOST WORTH IT & CHEAPEST!</div>`;
        } else if (isBestValue) {
            cardStyle = 'border-2 border-green-500 bg-green-50 shadow-md transform scale-[1.02] transition-transform animate-[pulse_2s_ease-in-out_infinite]';
            badgeHTML = `<div class="text-[10px] font-bold text-green-600 mt-1 flex items-center gap-1">✨ MOST WORTH IT</div>`;
        } else if (isCheapest) {
            cardStyle = 'border-2 border-blue-400 bg-blue-50 shadow-sm';
            badgeHTML = `<div class="text-[10px] font-bold text-blue-600 mt-1 flex items-center gap-1">💸 CHEAPEST</div>`;
        }

        let mediaHTML = '';
        if (offer.media_url) {
            const isVideo = offer.media_url.match(/\.(mp4|webm|ogg)$/i);
            if (isVideo) {
                mediaHTML = `
                    <video class="w-full h-32 object-cover rounded-lg mb-2 border border-gray-100" muted loop onmouseover="this.play()" onmouseout="this.pause()">
                        <source src="${offer.media_url}" type="video/mp4">
                    </video>`;
            } else {
                mediaHTML = `
                    <img src="${offer.media_url}" 
                        class="w-full h-32 object-cover rounded-lg mb-2 border border-gray-100" 
                        alt="${offer.food_name}"
                        onclick="window.open('${offer.media_url}', '_blank')">`;
            }
        }

        // Combine Seller Name and Last 4 Digits for Display
        const sellerPhoneLast4 = offer.contact && offer.contact.length >= 4 ? offer.contact.slice(-4) : offer.contact;
        const displaySellerName = `${offer.seller_name} ${sellerPhoneLast4}`;

        const card = document.createElement('div');
        card.className = `auction-card p-3 rounded-xl flex flex-col gap-1 transition-all ${cardStyle}`;

        card.innerHTML = `
            ${mediaHTML} 
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="text-[9px] text-gray-400 font-bold uppercase tracking-wider"><i class="fa-solid fa-store"></i> ${displaySellerName}</div>
                    <div class="font-bold text-gray-800 text-sm mt-0.5">
                        ${offer.food_name}
                    </div>
                    ${badgeHTML}
                </div>
                <div class="text-right flex flex-col items-end">
                    <div class="text-sm font-bold text-orange-600">
                        Rp ${price.toLocaleString('id-ID')}
                    </div>
                    <button
                        onclick="openOrder('${offer.seller_name}', '${offer.food_name.replace(/'/g, "\\'")}', '${offer.price}', '${offer.contact}', '${offer.stock}')"
                        class="bg-orange-500 text-white text-[10px] px-4 py-1.5 rounded-lg mt-2 font-bold hover:bg-orange-600 active:scale-95 transition-transform shadow-sm">
                        CHOOSE
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
                            class="w-2/3 p-2 rounded border outline-none focus:border-blue-500">
                        
                        <input type="text" id="offer-size-${req.id}" 
                            placeholder="Size/Notes" 
                            class="w-1/3 p-2 rounded border outline-none focus:border-blue-500 bg-white">
                    </div>
                    
                    <div class="flex gap-2 mb-2">
                        <div class="w-1/2">
                            <label class="text-[9px] text-gray-400 uppercase font-bold">Selling as:</label>
                            <input type="text" id="offer-seller-${req.id}" value="${savedSellerName}" readonly class="w-full p-2 rounded border bg-gray-100 text-gray-500 text-xs"/>
                        </div>
                        <div class="w-1/2">
                            <label class="text-[9px] text-gray-400 uppercase font-bold">WA Contact:</label>
                            <input type="text" id="offer-contact-${req.id}" value="${savedSellerPhone}" readonly class="w-full p-2 rounded border bg-gray-100 text-gray-500 text-xs"/>
                        </div>
                    </div>
                    
                    <div class="flex gap-2 mb-2">
                        <input type="number" id="offer-price-${req.id}" placeholder="Price (Rp)" class="w-1/2 p-2 rounded border border-blue-200 bg-blue-50 font-bold text-blue-700">
                        <input type="number" id="offer-stock-${req.id}" placeholder="Qty" value="1" class="w-1/2 p-2 rounded border focus:border-orange-500">
                    </div>

                    <div class="mb-3">
                        <label class="text-xs font-bold text-gray-500 mb-1 block">Upload Photo</label>
                        <input type="file" id="offer-media-${req.id}" accept="image/*,video/*" class="w-full text-xs text-gray-500" onchange="previewMedia(this, ${req.id})">
                        <div id="media-preview-${req.id}" class="mt-2 hidden"></div>
                    </div>

                    <button id="submit-btn-${req.id}" onclick="submitOffer(${req.id})" class="w-full bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                        Submit Offer
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
    // 1. Ambil input yang MEMANG diketik seller (Menu & Harga)
    const foodName = document.getElementById(`offer-name-${reqId}`).value;
    const price = document.getElementById(`offer-price-${reqId}`).value;
    const mediaFile = document.getElementById(`offer-media-${reqId}`).files[0];
    const btn = document.getElementById(`submit-btn-${reqId}`);

    // 2. AMBIL OTOMATIS dari Local Storage (Biar gak usah ngetik lagi)
    const sellerName = localStorage.getItem('seller_name');
    const contact = localStorage.getItem('seller_phone');

    // Validasi dasar
    if (!sellerName || !contact) {
        return alert("Klik ikon ⚙️ dulu untuk isi profil seller!");
    }
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

function openOrder(seller, food, price, contact, maxStock) {
    const modal = document.getElementById('order-modal');
    const qtyInput = document.getElementById('order-qty');
    qtyInput.max = maxStock;

    qtyInput.addEventListener('input', function () {
        if (parseInt(this.value) > parseInt(maxStock)) {
            this.value = maxStock;
            updateTotal();
            alert(`Maximum remaining portion/stock for this order is ${maxStock}!`);
        }
    });

    if (!modal) return console.error("Modal not found");

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('modal-seller-name').innerText = seller;
    document.getElementById('modal-food-name').innerText = food;
    document.getElementById('modal-price').innerText = "Rp " + Number(price).toLocaleString();

    const savedAddress = localStorage.getItem('buyer_address');
    if (savedAddress) {
        document.getElementById('order-address').value = savedAddress;
    }

    const savedName = localStorage.getItem('buyer_name');
    if (savedName) {
        document.getElementById('buyer-name').value = savedName;
    }

    document.getElementById('buyer-name').onchange = e => {
        localStorage.setItem('buyer_name', e.target.value);
    };

    const totalBox = document.getElementById('order-total');

    function updateTotal() {
        const qty = Number(qtyInput.value) || 1;
        const total = qty * Number(price);
        totalBox.innerText = "Total: Rp " + total.toLocaleString();
    }

    updateTotal();
    qtyInput.oninput = updateTotal;

    document.getElementById('order-address').onchange = e => {
        localStorage.setItem('buyer_address', e.target.value);
    };

    contact = contact.replace(/\D/g, '');
    if (contact.startsWith('0')) {
        contact = '62' + contact.slice(1);
    }

    document.getElementById('whatsapp-link').onclick = async () => {
        const qty = Number(qtyInput.value);
        const address = document.getElementById('order-address').value;
        const buyerName = document.getElementById('buyer-name').value;
        const total = qty * Number(price);

        if (currentDbUser.balance < total) {
            return alert('Insufficient balance!');
        }

        const newBalance = currentDbUser.balance - total;
        await supabaseClient.from('users').update({ balance: newBalance }).eq('id', currentDbUser.id);

        const { data: orderData, error: orderError } = await supabaseClient.from('orders').insert([{
            user_id: currentDbUser.id,
            request_id: currentRequestId,
            buyer_name: buyerName,
            buyer_address: address,
            seller_name: seller,
            food_name: food,
            price: parseInt(price),
            quantity: qty,
            total: total,
            contact: contact
        }]).select();

        if (!orderError) {
            saveUserHabit(food, price, false);
            await loadUserProfile();

            const msg = `Hi ${seller} \nI would like to place an order:\nFood: ${food}\nQuantity: ${qty}\nPrice per item: Rp ${Number(price).toLocaleString()}\nTotal: Rp ${total.toLocaleString()}\n\nName: ${buyerName}\nAddress: ${address}\n\nPlease confirm the order. Thank you`;
            const waLink = `https://wa.me/${contact}?text=${encodeURIComponent(msg)}`;

            closeModal();
            window.open(waLink, '_blank');
        } else {
            alert("Order failed: " + orderError.message);
        }
    };
}

async function loadOrderHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="text-center text-gray-500 py-4">Loading history...</div>';

    try {
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('buyer_name', localStorage.getItem('buyer_name'))
            .order('created_at', { ascending: false });

        let topups = JSON.parse(localStorage.getItem('topup_history') || '[]');
        let allHistory = [];

        if (orders) {
            orders.forEach(o => {
                allHistory.push({ type: 'buy', title: `Order: ${o.food_name}`, amount: o.total, date: new Date(o.created_at).getTime() });
            });
        }

        topups.forEach(t => {
            allHistory.push({ type: 'topup', title: 'Top Up Balance', amount: t.amount, date: t.date });
        });

        allHistory.sort((a, b) => b.date - a.date);

        listEl.innerHTML = '';
        let totalSpend = 0;

        if (allHistory.length === 0) {
            listEl.innerHTML = '<div class="text-center text-gray-400 mt-4 italic">No transactions yet.</div>';
            return;
        }

        // GOPAY STYLE UI
        allHistory.forEach(item => {
            const el = document.createElement('div');
            el.className = "p-3 border-b flex justify-between items-center hover:bg-gray-50 transition-colors";

            if (item.type === 'buy') {
                totalSpend += item.amount;
                el.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="bg-orange-100 p-2 rounded-full text-orange-500 w-10 h-10 flex items-center justify-center shadow-sm">
                            <i class="fa-solid fa-utensils"></i>
                        </div>
                        <div>
                            <div class="font-bold text-gray-800 text-sm">${item.title}</div>
                            <div class="text-[10px] text-gray-400">Payment successful</div>
                        </div>
                    </div>
                    <div class="font-bold text-red-500 text-sm">- Rp ${item.amount.toLocaleString('id-ID')}</div>
                `;
            } else {
                el.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="bg-green-100 p-2 rounded-full text-green-600 w-10 h-10 flex items-center justify-center shadow-sm">
                            <i class="fa-solid fa-wallet"></i>
                        </div>
                        <div>
                            <div class="font-bold text-gray-800 text-sm">${item.title}</div>
                            <div class="text-[10px] text-gray-400">Top Up successful</div>
                        </div>
                    </div>
                    <div class="font-bold text-green-600 text-sm">+ Rp ${item.amount.toLocaleString('id-ID')}</div>
                `;
            }
            listEl.appendChild(el);
        });

        const totalSpendEl = document.getElementById('total-spend');
        if (totalSpendEl) totalSpendEl.innerText = `Rp ${totalSpend.toLocaleString('id-ID')}`;

    } catch (err) {
        console.error("History error:", err);
        listEl.innerHTML = '<div class="text-center text-red-500 mt-4">Failed to load history</div>';
    }
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
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        currentUser = session.user;
        await loadUserProfile();
    }

    const UserInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const chatAreaEl = document.getElementById('chat-area');

    if (UserInput && sendBtn) {
        let isProcessing = false;
        const handleSendClick = (e) => {
            if (e) e.preventDefault();
            if (isProcessing) return;
            const val = UserInput.value.trim();
            if (!val) return;
            isProcessing = true;
            UserInput.value = '';
            addMessage(val, "user");

            if (typeof sendRequest === 'function') sendRequest(val);
            setTimeout(() => { isProcessing = false; }, 500);
        };
        sendBtn.onclick = handleSendClick;
        UserInput.onkeydown = (e) => { if (e.key === 'Enter') handleSendClick(e); };

        if (chatAreaEl && chatAreaEl.innerHTML.trim() === "") {
            setTimeout(() => {
                addMessage("Tell me what you're craving and watch sellers compete to give you the best offer!", "bot");
            }, 300);
        }
    }

    const sellerRequestsListEl = document.getElementById('seller-requests');
    if (sellerRequestsListEl) {
        loadSellerRequests();
        setInterval(() => {
            loadSellerRequests();
        }, 5000);
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
window.handleSend = handleSend;