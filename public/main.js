document.addEventListener("DOMContentLoaded", function () {
    // ===== STATE MANAGEMENT =====
    let activeCard = null;

    // ===== KONFIGURASI =====
    const CACHE_DURATION = {
        UNSPLASH: 604800,     // 7 hari dalam detik
        GEMINI: 604800,       // 7 hari dalam detik
    };

    const KANJI_IMAGE_MAPPING = {
        'japan-matsuri': 'japan-matsuri',
        'hanami': 'cherry-blossom-japan',
        'japan-festival': 'japan-festival'
    };

    // ===== FUNGSI UTILITAS CACHE =====
    function cleanupStorage() {
        const now = new Date().getTime();
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('cache_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data.expiry && data.expiry < now) {
                        localStorage.removeItem(key);
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                }
            }
        });
    }

    function setStorageWithExpiry(key, value, ttl) {
        const item = {
            value: value,
            expiry: new Date().getTime() + (ttl * 1000)
        };
        
        try {
            localStorage.setItem(`cache_${key}`, JSON.stringify(item));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                cleanupStorage();
                try {
                    localStorage.setItem(`cache_${key}`, JSON.stringify(item));
                } catch (error) {
                    console.error('Gagal menyimpan ke cache:', error);
                }
            }
        }
    }

    function getStorageWithExpiry(key) {
        const item = localStorage.getItem(`cache_${key}`);
        if (!item) return null;

        try {
            const data = JSON.parse(item);
            if (data.expiry < new Date().getTime()) {
                localStorage.removeItem(`cache_${key}`);
                return null;
            }
            return data.value;
        } catch {
            return null;
        }
    }

    // ===== FUNGSI FETCH DATA =====
    async function fetchUnsplashImage(kanji) {
        const cacheKey = `unsplash_${kanji}`;
        const cachedImage = getStorageWithExpiry(cacheKey);
        
        if (cachedImage) {
            return cachedImage;
        }

        try {
            const query = KANJI_IMAGE_MAPPING[kanji] || 'japan-matsuri';
            const response = await fetch(`/api/unsplash?query=${encodeURIComponent(query)}`);
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            setStorageWithExpiry(cacheKey, data.imageUrl, CACHE_DURATION.UNSPLASH);
            return data.imageUrl;
        } catch (error) {
            console.error("Error fetching image:", error);
            return "https://placehold.co/600x400/ff0000/ffffff/png?text=Error+Loading+Image";
        }
    }

    async function fetchGeminiData(kanji) {
        const cacheKey = `gemini_${kanji}`;
        const cachedData = getStorageWithExpiry(cacheKey);
        
        if (cachedData) {
            return cachedData;
        }

        const promptInstruction = `Anda adalah seorang pakar bahasa Jepang. Jelaskan perayaan ${kanji} dan maknanya dalam budaya Jepang.`;

        try {
            const response = await fetch(`/api/gemini/${kanji}?prompt=${encodeURIComponent(promptInstruction)}`);
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            setStorageWithExpiry(cacheKey, data, CACHE_DURATION.GEMINI);
            return data;
        } catch (error) {
            console.error("Error fetching Gemini data:", error);
            throw error;
        }
    }

    // ===== CARD UI FUNCTIONS =====
    function showLoadingCard(kanji) {
        const loadingContent = {
            content: `
                <div class="relative">
                <h3 class="text-xl font-bold mb-2">Loading for ${kanji} </h3>
                <p class="text-sm text-gray-600 mb-1">.........</p>
                <p class="text-sm text-gray-600 mb-3">...........</p>
                <div class="relative w-full h-32 mb-4 overflow-hidden rounded-md">
                    <img src="/spinner.gif" 
                         alt="" 
                         class="w-full h-full object-cover">
                </div>
                <div class="text-sm text-gray-700">
                   Please wait........
                </div>
            </div>
            `
        };

        const card = createCard(kanji);
        card.innerHTML = `
            <div class="relative">
                ${loadingContent.content}
            </div>
        `;

        showCardWithAnimation(card);
        return card;
    }

    function createErrorContent(kanji) {
        return {
            title: kanji,
            romaji: "Error",
            translation: "Gagal memuat konten",
            image: "https://placehold.co/600x400/ff0000/ffffff/png?text=Error",
            description: "Terjadi kesalahan saat memuat konten. Silakan coba lagi."
        };
    }

    function showErrorCard(kanji) {
        const errorContent = createErrorContent(kanji);
        showCard(kanji, errorContent);
    }

    function createCard(id) {
        const card = document.createElement('div');
        card.className = 'calendar-card fixed bg-white shadow-lg rounded-lg p-6 max-w-sm z-50';
        card.setAttribute('data-for-kanji', id);
        
        // Position card in center
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        card.style.top = `${(viewportHeight - 400) / 2}px`;
        card.style.left = `${(viewportWidth - 384) / 2}px`; // 384px = max-w-sm (24rem)
        
        // Initial state for animation
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        
        return card;
    }

    function createCloseButton() {
        return `
            <button class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors" 
                    onclick="this.closest('.calendar-card').remove(); window.activeCard = null;">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        `;
    }

    function showCardWithAnimation(card) {
        removeExistingCard();
        document.body.appendChild(card);
        activeCard = card;
        
        // Trigger animation
        requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
        });
    }

    function removeExistingCard() {
        const existingCard = document.querySelector('.calendar-card');
        if (existingCard) {
            existingCard.style.opacity = '0';
            existingCard.style.transform = 'scale(0.95)';
            setTimeout(() => existingCard.remove(), 300);
        }
    }

    function showCard(id, data) {
        const card = createCard(id);
        
        card.innerHTML = `
            <div class="relative">
                ${createCloseButton()}
                <h3 class="text-xl font-bold mb-2">${data.title}</h3>
                <p class="text-sm text-gray-600 mb-1">${data.romaji}</p>
                <p class="text-sm text-gray-600 mb-3">${data.translation}</p>
                <div class="relative w-full h-32 mb-4 overflow-hidden rounded-md">
                    <img src="${data.image}" 
                         alt="${data.title}" 
                         class="w-full h-full object-cover"
                         onerror="this.src='https://placehold.co/600x400/ff0000/ffffff/png?text=Error'">
                </div>
                <div class="text-sm text-gray-700">
                    ${data.description}
                </div>
            </div>
        `;

        showCardWithAnimation(card);
    }

    // ===== EVENT HANDLERS =====
    async function handleKanjiClick(kanji, element) {
        if (document.querySelector(`[data-for-kanji="${kanji}"]`)) return;
        
        // Show loading state
        showLoadingCard(kanji);
        
        try {
            // Fetch data with minimum loading time
            const [imageUrl, data] = await Promise.all([
                fetchUnsplashImage(kanji),
                fetchGeminiData(kanji),
                new Promise(resolve => setTimeout(resolve, 1000)) // Minimum 1s loading
            ]);

            // Show final data if this card is still active
            if (activeCard?.getAttribute('data-for-kanji') === kanji) {
                showCard(kanji, {
                    title: data.title || kanji,
                    romaji: data.romaji || '',
                    translation: data.translation || '',
                    image: imageUrl,
                    description: data.description || ''
                });
            }
        } catch (error) {
            console.error("Error:", error);
            if (activeCard?.getAttribute('data-for-kanji') === kanji) {
                showErrorCard(kanji);
            }
        }
    }

    // ===== EVENT LISTENERS =====
    document.addEventListener("click", (event) => {
        const targetCell = event.target.closest('[data-kanji]');
        if (!targetCell && !event.target.closest('.calendar-card')) {
            removeExistingCard();
            return;
        }
        
        if (targetCell) {
            event.preventDefault();
            const kanji = targetCell.getAttribute('data-kanji');
            if (kanji) handleKanjiClick(kanji, targetCell);
        }
    });

    // Handle escape key
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && activeCard) {
            removeExistingCard();
        }
    });

    // Handle window resize
    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (activeCard) {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                activeCard.style.top = `${(viewportHeight - 400) / 2}px`;
                activeCard.style.left = `${(viewportWidth - 384) / 2}px`;
            }
        }, 100);
    });

    // ===== INITIALIZATION =====
    function initializeCalendar() {
        // Pre-fetch dan cache semua gambar
        Object.keys(KANJI_IMAGE_MAPPING).forEach(kanji => {
            const cachedImage = getStorageWithExpiry(`unsplash_${kanji}`);
            if (!cachedImage) {
                fetchUnsplashImage(kanji).catch(console.error);
            }
        });

        // Setup kanji cells
        document.querySelectorAll('[data-kanji]').forEach(element => {
            element.classList.add('kanji-cell');
            element.style.cursor = 'pointer';
        });
    }

    // Cleanup dan inisialisasi
    cleanupStorage();
    initializeCalendar();
});