document.addEventListener("DOMContentLoaded", () => {
    const channelListUl = document.getElementById("channel-list-dynamic");
    const videoPlayer = document.getElementById("video-player");
    const searchInput = document.getElementById("search-input");
    const playerOverlay = document.getElementById("player-overlay");
    const currentChannelLogo = document.getElementById("current-channel-logo");
    const currentChannelName = document.getElementById("current-channel-name");
    const sidebar = document.querySelector(".channel-sidebar"); // Get sidebar for scroll listener

    let hls = null;
    let allChannels = []; // Stores all channels from JSON
    let displayedChannels = []; // Stores channels currently displayed (for filtering)
    let currentChannelIndex = 0; // Index for lazy loading
    const channelsPerLoad = 50; // Number of channels to load each time
    let isLoading = false; // Flag to prevent multiple loads at once
    let currentSearchTerm = ""; // Store current search term

    // --- Fetch Channels --- 
    async function loadInitialChannels() {
        try {
            const response = await fetch("channels.json");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            allChannels = await response.json(); // Load all channels into memory
            console.log(`Loaded ${allChannels.length} total channels.`);
            // Initial display
            filterAndDisplayChannels(); 
        } catch (error) {
            console.error("Error loading channels:", error);
            if (channelListUl) channelListUl.innerHTML = `<li class="loading-placeholder error-message">فشل تحميل قائمة القنوات.</li>`;
        }
    }

    // --- Display Logic (Lazy Loading) --- 
    function displayChannelsBatch(channelsToDisplay) {
        if (!channelListUl || isLoading) return;
        isLoading = true;

        const fragment = document.createDocumentFragment();
        const nextBatchEnd = Math.min(currentChannelIndex + channelsPerLoad, channelsToDisplay.length);
        
        console.log(`Displaying channels from ${currentChannelIndex} to ${nextBatchEnd-1}`);

        for (let i = currentChannelIndex; i < nextBatchEnd; i++) {
            const channel = channelsToDisplay[i];
            const li = createChannelListItem(channel);
            fragment.appendChild(li);
        }

        channelListUl.appendChild(fragment);
        currentChannelIndex = nextBatchEnd; // Update index for the next load
        isLoading = false;
        
        // Remove loading placeholder if it exists and we've loaded channels
        const loadingLi = channelListUl.querySelector(".loading-placeholder");
        if (loadingLi && channelListUl.children.length > 1) { // Check if more than just placeholder
             loadingLi.remove();
        }
        
        // Add loading indicator if more channels are available
        updateLoadingIndicator(channelsToDisplay);
    }
    
    function createChannelListItem(channel) {
        const li = document.createElement("li");
        li.dataset.url = channel.url;
        li.dataset.name = channel.name;
        li.dataset.logo = channel.logo || "placeholder.png";

        const img = document.createElement("img");
        img.src = channel.logo || "placeholder.png";
        img.alt = `${channel.name} Logo`;
        img.className = "channel-logo";
        img.loading = "lazy"; // Native image lazy loading
        img.onerror = () => { img.src = "placeholder.png"; };

        const span = document.createElement("span");
        span.className = "channel-name";
        span.textContent = channel.name;

        li.appendChild(img);
        li.appendChild(span);
        li.addEventListener("click", handleChannelClick);
        return li;
    }
    
    function updateLoadingIndicator(channelsSource) {
        // Remove existing indicator first
        const existingIndicator = channelListUl.querySelector(".loading-indicator");
        if (existingIndicator) existingIndicator.remove();
        
        // Add indicator if there are more channels to load
        if (currentChannelIndex < channelsSource.length) {
            const indicatorLi = document.createElement("li");
            indicatorLi.className = "loading-indicator";
            indicatorLi.textContent = "جاري تحميل المزيد...";
            channelListUl.appendChild(indicatorLi);
        }
    }

    // --- Scroll Handling for Lazy Load --- 
    if (channelListUl) {
        channelListUl.addEventListener("scroll", () => {
            // Check if scrolled near the bottom
            // scrollTop + clientHeight >= scrollHeight - threshold
            if (!isLoading && (channelListUl.scrollTop + channelListUl.clientHeight >= channelListUl.scrollHeight - 150)) {
                console.log("Scroll near bottom, loading more...");
                displayChannelsBatch(displayedChannels); // Load next batch of currently filtered/displayed channels
            }
        });
    }

    // --- Search and Filtering Logic --- 
    function filterAndDisplayChannels() {
        const searchTerm = currentSearchTerm;
        displayedChannels = allChannels.filter(channel => 
            channel.name.toLowerCase().includes(searchTerm)
        );
        
        // Reset display for new filter/search
        channelListUl.innerHTML = ""; // Clear the list
        currentChannelIndex = 0; // Reset index
        isLoading = false; // Reset loading flag
        
        if (displayedChannels.length === 0) {
             channelListUl.innerHTML = `<li class="loading-placeholder">لا توجد قنوات مطابقة.</li>`;
             return;
        }
        
        // Display the first batch of filtered results
        displayChannelsBatch(displayedChannels);
    }

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentSearchTerm = e.target.value.toLowerCase().trim();
            // Debounce search slightly to avoid excessive filtering on rapid typing (optional)
            // setTimeout(() => { filterAndDisplayChannels(); }, 200); 
            filterAndDisplayChannels(); // Filter and display immediately
        });
    }

    // --- HLS Player Setup (Mostly Unchanged) --- 
    function initializePlayer(streamUrl) {
        if (Hls.isSupported()) {
            if (hls) {
                hls.destroy();
            }
            hls = new Hls({
                 // Optional HLS.js config for potentially better error recovery
                 abrEwmaDefaultEstimate: 500000, // Start with a lower bitrate estimate
                 lowLatencyMode: false, // Disable low latency mode unless needed
            });
            hls.loadSource(streamUrl);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoPlayer.play().catch(e => console.error("Play interrupted:", e));
                if (playerOverlay) playerOverlay.classList.add("hidden");
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error("HLS Error:", data);
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.warn("HLS Network Error - trying to recover...");
                            hls.startLoad(); // Try to recover network errors
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                             console.warn("HLS Media Error - trying to recover...");
                            hls.recoverMediaError(); // Try to recover media errors
                            break;
                        default:
                            console.error("Unrecoverable HLS error");
                            hls.destroy();
                            showOverlayMessage(`خطأ في تحميل القناة (${data.details})`);
                            break;
                    }
                } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
                     console.warn("Fragment load error, continuing..."); // Often recoverable
                }
            });
        } else if (videoPlayer.canPlayType("application/vnd.apple.mpegurl")) {
            videoPlayer.src = streamUrl;
            videoPlayer.addEventListener("loadedmetadata", () => {
                videoPlayer.play().catch(e => console.error("Play interrupted:", e));
                 if (playerOverlay) playerOverlay.classList.add("hidden");
            });
             videoPlayer.addEventListener("error", (e) => {
                 console.error("Native HLS Error:", e);
                 showOverlayMessage("حدث خطأ أثناء تحميل القناة.");
             });
        } else {
            console.error("HLS is not supported on this browser.");
            showOverlayMessage("المتصفح لا يدعم تشغيل هذا النوع من البث.");
        }
    }

    // --- Channel Click Handling (Unchanged) --- 
    function handleChannelClick(event) {
        const listItem = event.currentTarget;
        const url = listItem.dataset.url;
        const name = listItem.dataset.name;
        const logo = listItem.dataset.logo;

        if (!url) {
            console.error("No URL found for this channel.");
            return;
        }

        if (currentChannelLogo) {
            currentChannelLogo.src = logo;
            currentChannelLogo.style.display = logo === "placeholder.png" ? "none" : "inline-block";
        }
        if (currentChannelName) {
            currentChannelName.textContent = name;
        }
        if (playerOverlay) playerOverlay.classList.remove("hidden"); 

        document.querySelectorAll("#channel-list-dynamic li.channel-item").forEach(li => li.classList.remove("selected")); // Ensure only channel items are deselected
        listItem.classList.add("selected");

        initializePlayer(url);
    }
    
    // --- Overlay Helper (Unchanged) --- 
    function showOverlayMessage(message) {
         if (currentChannelName) currentChannelName.textContent = message;
         if (currentChannelLogo) currentChannelLogo.style.display = "none";
         if (playerOverlay) playerOverlay.classList.remove("hidden");
         if (hls) hls.destroy();
         videoPlayer.pause();
         videoPlayer.src = ""; 
    }

    // --- Initial Load --- 
    loadInitialChannels();

});

