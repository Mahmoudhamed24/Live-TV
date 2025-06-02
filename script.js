document.addEventListener("DOMContentLoaded", () => {
    const channelListUl = document.getElementById("channel-list-dynamic");
    const videoPlayer = document.getElementById("video-player");
    const searchInput = document.getElementById("search-input");
    const playerOverlay = document.getElementById("player-overlay");
    const currentChannelLogo = document.getElementById("current-channel-logo");
    const currentChannelName = document.getElementById("current-channel-name");
    const loadingPlaceholder = document.querySelector(".loading-placeholder");

    let hls = null;
    let allChannels = []; // To store all channels for searching

    // --- Fetch and Display Channels --- 
    async function loadChannels() {
        try {
            const response = await fetch("channels.json");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            allChannels = await response.json();
            displayChannels(allChannels);
            if (loadingPlaceholder) loadingPlaceholder.remove(); // Remove loading text
        } catch (error) {
            console.error("Error loading channels:", error);
            if (channelListUl) channelListUl.innerHTML = `<li class="loading-placeholder">فشل تحميل قائمة القنوات.</li>`;
        }
    }

    function displayChannels(channels) {
        if (!channelListUl) return;
        channelListUl.innerHTML = ""; // Clear existing list
        if (channels.length === 0) {
             channelListUl.innerHTML = `<li class="loading-placeholder">لا توجد قنوات مطابقة.</li>`;
             return;
        }
        channels.forEach(channel => {
            const li = document.createElement("li");
            li.dataset.url = channel.url;
            li.dataset.name = channel.name;
            li.dataset.logo = channel.logo || "placeholder.png"; // Use placeholder if no logo

            const img = document.createElement("img");
            img.src = channel.logo || "placeholder.png";
            img.alt = `${channel.name} Logo`;
            img.className = "channel-logo";
            img.onerror = () => { img.src = "placeholder.png"; }; // Fallback if logo fails to load

            const span = document.createElement("span");
            span.className = "channel-name";
            span.textContent = channel.name;

            li.appendChild(img);
            li.appendChild(span);
            li.addEventListener("click", handleChannelClick);
            channelListUl.appendChild(li);
        });
    }

    // --- Search Functionality --- 
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const filteredChannels = allChannels.filter(channel => 
                channel.name.toLowerCase().includes(searchTerm)
            );
            displayChannels(filteredChannels);
        });
    }

    // --- HLS Player Setup --- 
    function initializePlayer(streamUrl) {
        if (Hls.isSupported()) {
            if (hls) {
                hls.destroy(); // Destroy previous instance if exists
            }
            hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(videoPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoPlayer.play();
                if (playerOverlay) playerOverlay.classList.add("hidden"); // Hide overlay on play
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error("HLS Error:", data);
                // Handle errors, e.g., show error message
                if (data.fatal) {
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error("fatal network error encountered, try recovering");
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error("fatal media error encountered, try recovering");
                            hls.recoverMediaError();
                            break;
                        default:
                            // cannot recover
                            hls.destroy();
                            showOverlayMessage("حدث خطأ أثناء تحميل القناة.");
                            break;
                    }
                }
            });
        } else if (videoPlayer.canPlayType("application/vnd.apple.mpegurl")) {
            // Native HLS support (e.g., Safari)
            videoPlayer.src = streamUrl;
            videoPlayer.addEventListener("loadedmetadata", () => {
                videoPlayer.play();
                 if (playerOverlay) playerOverlay.classList.add("hidden");
            });
             videoPlayer.addEventListener("error", () => {
                 showOverlayMessage("حدث خطأ أثناء تحميل القناة.");
             });
        } else {
            console.error("HLS is not supported on this browser.");
            showOverlayMessage("المتصفح لا يدعم تشغيل هذا النوع من البث.");
        }
    }

    // --- Channel Click Handling --- 
    function handleChannelClick(event) {
        const listItem = event.currentTarget;
        const url = listItem.dataset.url;
        const name = listItem.dataset.name;
        const logo = listItem.dataset.logo;

        if (!url) {
            console.error("No URL found for this channel.");
            return;
        }

        // Update overlay info
        if (currentChannelLogo) {
            currentChannelLogo.src = logo;
            currentChannelLogo.style.display = logo === "placeholder.png" ? "none" : "inline-block";
        }
        if (currentChannelName) {
            currentChannelName.textContent = name;
        }
        // Show overlay briefly while loading
        if (playerOverlay) playerOverlay.classList.remove("hidden"); 

        // Highlight selected item
        document.querySelectorAll("#channel-list-dynamic li").forEach(li => li.classList.remove("selected"));
        listItem.classList.add("selected");

        // Initialize player
        initializePlayer(url);
    }
    
    // --- Overlay Helper --- 
    function showOverlayMessage(message) {
         if (currentChannelName) currentChannelName.textContent = message;
         if (currentChannelLogo) currentChannelLogo.style.display = "none";
         if (playerOverlay) playerOverlay.classList.remove("hidden");
         // Stop video if playing
         if (hls) hls.destroy();
         videoPlayer.pause();
         videoPlayer.src = ""; // Clear source
    }

    // --- Initial Load --- 
    loadChannels();

});

