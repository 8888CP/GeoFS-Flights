// ==UserScript==
// @name         GeoFS Flights
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Fixed bottom bar, popup entry, draggable banner, Logo loaded from remote JSON.
// @match        *://*.geo-fs.com/*
// @match        *://*.geofs.net/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ------- 1. External Logo JSON URL -------
    const LOGO_JSON_URL = "https://raw.githubusercontent.com/8888CP/GeoFS-Flights/refs/heads/main/Airlines.json";

    const FALLBACK_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Ctext x='75' y='82' font-family='Arial' font-size='28' text-anchor='middle' fill='%23666'%3ELOGO%3C/text%3E%3C/svg%3E";

    let logoData = [];

    // ------- 2. Load Remote JSON -------
    async function loadLogoJSON() {
        try {
            const resp = await fetch(LOGO_JSON_URL);
            if (resp.ok) {
                logoData = await resp.json();
                console.log("✅ External Logo JSON loaded successfully! URL: " + LOGO_JSON_URL);
            } else {
                console.warn("⚠️ Failed to fetch external JSON, using fallback.");
            }
        } catch (e) {
            console.warn("⚠️ Failed to fetch external JSON (network or CORS), using fallback.");
        }
    }
    loadLogoJSON();

    // ------- 3. History Management (LocalStorage) -------
    function getHistory() {
        try { return JSON.parse(localStorage.getItem('fp_history')) || []; } catch(e) { return []; }
    }
    function saveHistory(data) { localStorage.setItem('fp_history', JSON.stringify(data)); }

    // ------- 4. Global Styles -------
    const style = document.createElement('style');
    style.textContent = `
        #fp-modal { transition: opacity 0.3s ease; z-index: 9999; }
        #fp-modal input:focus { outline: none; border-color: #1976d2 !important; }
        #fp-banner { box-shadow: 0 4px 15px rgba(0,0,0,0.8); cursor: grab; }
        #fp-banner:active { cursor: grabbing; }
        .fp-history-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; margin-bottom: 6px; background: #333; border-radius: 4px; cursor: pointer; transition: 0.2s; }
        .fp-history-item:hover { background: #444; }
        .fp-history-item .fp-del { color: #d32f2f; font-weight: bold; margin-left: 10px; cursor: pointer; font-size: 18px; flex-shrink: 0; }
        .fp-history-item .fp-del:hover { color: #ff5252; }
        #fp-history-list { max-height: 150px; overflow-y: auto; margin-top: 10px; }
        #fp-history-list::-webkit-scrollbar { width: 6px; }
        #fp-history-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
    `;
    document.head.appendChild(style);

    // ------- 5. UI Initialization -------
    function initFlightPlanBtn() {
        const aircraftBtn = document.querySelector('button[data-toggle-panel=".geofs-aircraft-list"]');
        if (!aircraftBtn) return false;
        if (document.getElementById('fp-btn')) return true;

        const fpBtn = aircraftBtn.cloneNode(true);
        fpBtn.id = 'fp-btn';
        fpBtn.textContent = 'Flight';
        fpBtn.removeAttribute('data-toggle-panel');
        aircraftBtn.parentNode.insertBefore(fpBtn, aircraftBtn);
        if (window.componentHandler) window.componentHandler.upgradeElement(fpBtn);

        if (!document.getElementById('fp-modal')) {
            const modalHTML = `
            <div id="fp-modal" style="display:none; position:fixed; top:50%; right:20px; transform:translateY(-50%); width:340px; background:#222; padding:20px; border-radius:8px; border:1px solid #444; z-index:9999; color:#fff; box-shadow:0 4px 20px rgba(0,0,0,0.9); font-family: 'Segoe UI', Roboto, sans-serif;">
                <h3 style="margin-top:0; text-align:center; color:#fff; font-weight:400; letter-spacing:1px;">Flight Plan</h3>
                
                <input id="fp-airline" placeholder="Airline (e.g., Sichuan Airlines)" style="width:100%; margin-bottom:10px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <input id="fp-aircraft" placeholder="Aircraft (e.g., A320-214)" style="width:100%; margin-bottom:10px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                
                <div style="display:flex; gap:10px; width:100%; margin-bottom:10px;">
                    <input id="fp-departure" placeholder="Departure (e.g., Beijing Daxing)" style="flex:1; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                    <input id="fp-arrival" placeholder="Arrival (e.g., Chengdu Shuangliu)" style="flex:1; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                </div>

                <input id="fp-flightno" placeholder="Flight No. (e.g., 3U6687)" style="width:100%; margin-bottom:15px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                
                <div style="display:flex; flex-direction:column; gap:15px;">
                    <button id="fp-confirm" style="width:100%; padding:12px; background:#1976d2; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:16px; font-weight:bold;">Start Flight</button>
                    
                    <div style="border-top:1px solid #444; padding-top:12px;">
                        <div style="font-size:14px; color:#aaa; margin-bottom:8px;">Flight History</div>
                        <div id="fp-history-list"></div>
                    </div>
                </div>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        if (!document.getElementById('fp-banner')) {
            const bannerHTML = `
            <div id="fp-banner" style="display:none; align-items:center; position:fixed; left:20px; bottom:70px; background:rgba(25,25,25,0.95); padding:10px 18px; border-radius:6px; z-index:9998; transform:translateY(25px); transition:all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events:none; box-shadow:0 4px 15px rgba(0,0,0,0.7); color:#fff; font-family: 'Segoe UI', Roboto, sans-serif;">
                <div style="flex-shrink:0; display:flex; align-items:center; justify-content:center; width:150px; height:150px; margin-right:16px; background:transparent; border-radius:4px; overflow:hidden;">
                    <img id="fp-logo" src="" style="width:100%; height:100%; object-fit:contain; display:block;">
                </div>
                <div style="flex-shrink:0; width:3px; height:60px; background:#c62828; margin-right:16px;"></div>
                
                <div style="display:flex; flex-direction:column; justify-content:space-between; height:56px; margin-right:15px;">
                    <div id="fp-flightno-display" style="font-size:24px; font-weight:600; color:#fff; line-height:1;">3U6687</div>
                    
                    <div id="fp-route-en" style="font-size:14px; color:#ccc; line-height:1.2; margin-top:6px;">Beijing Daxing - Chengdu Shuangliu</div>
                </div>

                <button id="fp-end-flight-btn" style="padding:8px 15px; background:#d32f2f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:14px; margin-left:10px; pointer-events:auto;">End Flight</button>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', bannerHTML);
        }

        // ------- 6. Render History List -------
        function renderHistory() {
            const list = document.getElementById('fp-history-list');
            if (!list) return;
            const data = getHistory();
            if (data.length === 0) {
                list.innerHTML = '<div style="text-align:center; color:#555; font-size:13px; padding:10px;">No flight records</div>';
                return;
            }
            list.innerHTML = '';
            data.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'fp-history-item';
                
                const span = document.createElement('span');
                span.textContent = item.flightno || 'Unknown Flight';
                span.onclick = function(e) {
                    e.stopPropagation();
                    showBanner(item);
                };
                
                const del = document.createElement('span');
                del.className = 'fp-del';
                del.textContent = '×';
                del.onclick = function(e) {
                    e.stopPropagation();
                    data.splice(index, 1);
                    saveHistory(data);
                    renderHistory();
                    const current = document.getElementById('fp-banner');
                    if (current && current.style.display !== 'none') {
                        const currentNo = document.getElementById('fp-flightno-display').textContent;
                        if (currentNo === item.flightno) {
                            current.style.display = 'none';
                            current.style.opacity = '0';
                            current.style.transform = 'translateY(25px)';
                        }
                    }
                };
                
                div.appendChild(span);
                div.appendChild(del);
                list.appendChild(div);
            });
        }

        // ------- 7. Show Banner -------
        function showBanner(item) {
            const banner = document.getElementById('fp-banner');
            if (!banner) return;

            banner.style.left = '20px';
            banner.style.bottom = '70px';
            banner.style.top = 'auto';

            let logoUrl = FALLBACK_LOGO; 
            if (logoData && logoData.length > 0) {
                const airlineName = (item.airline || '').toLowerCase();
                const matched = logoData.find(entry => 
                    airlineName.includes(entry.airline.toLowerCase()) || 
                    entry.airline.toLowerCase().includes(airlineName)
                );
                if (matched) {
                    logoUrl = matched.logo;
                }
            }

            document.getElementById('fp-logo').src = logoUrl;
            document.getElementById('fp-logo').onerror = function() { this.src = FALLBACK_LOGO; };

            document.getElementById('fp-flightno-display').textContent = item.flightno || '------';

            let dep = item.departure || '', arr = item.arrival || '';
            if (!dep && !arr && item.route) {
                const parts = item.route.split(' - ');
                if (parts.length === 2) { dep = parts[0]; arr = parts[1]; }
            }
            document.getElementById('fp-route-en').textContent = (dep || '???') + ' - ' + (arr || '???');

            banner.style.display = 'flex';
            void banner.offsetHeight; 

            banner.style.transition = 'none';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(25px)';
            banner.style.pointerEvents = 'none';

            requestAnimationFrame(() => {
                banner.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                banner.style.opacity = '1';
                banner.style.transform = 'translateY(0)';
                banner.style.pointerEvents = 'auto';
            });
        }

        // ------- 8. Draggable Logic -------
        let isDragging = false;
        let dragStartX, dragStartY, dragStartLeft, dragStartTop;
        const bannerEl = document.getElementById('fp-banner');

        function initDragListeners() {
            if (!bannerEl) return;
            
            bannerEl.addEventListener('mousedown', function(e) {
                if (e.target.id === 'fp-end-flight-btn') return; 
                isDragging = true;
                const rect = bannerEl.getBoundingClientRect();
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                
                const style = window.getComputedStyle(bannerEl);
                dragStartLeft = parseInt(style.left) || 20;
                dragStartTop = parseInt(style.top) || (window.innerHeight - rect.height - 70);
                
                if (parseInt(style.bottom) > 0 && isNaN(parseFloat(bannerEl.style.top))) {
                    dragStartTop = window.innerHeight - rect.height - parseInt(style.bottom);
                }

                bannerEl.style.transition = 'none';
                bannerEl.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function(e) {
                if (!isDragging) return;
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;
                
                bannerEl.style.left = (dragStartLeft + dx) + 'px';
                bannerEl.style.top = (dragStartTop + dy) + 'px';
                bannerEl.style.bottom = 'auto';
            });

            document.addEventListener('mouseup', function(e) {
                if (isDragging) {
                    isDragging = false;
                    bannerEl.style.cursor = 'grab';
                    bannerEl.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                }
            });
        }
        initDragListeners();

        // ------- 9. Event Binding -------
        fpBtn.onclick = function() {
            document.getElementById('fp-modal').style.display = 'block';
            renderHistory();
        };

        document.getElementById('fp-confirm').onclick = function() {
            const airline = document.getElementById('fp-airline').value.trim();
            const aircraft = document.getElementById('fp-aircraft').value.trim();
            const departure = document.getElementById('fp-departure').value.trim();
            const arrival = document.getElementById('fp-arrival').value.trim();
            const flightno = document.getElementById('fp-flightno').value.trim();

            if (!flightno) {
                ui.notification.show("Please enter a flight number!");
                return;
            }

            const flightData = { airline, aircraft, departure, arrival, route: departure + ' - ' + arrival, flightno };
            
            let history = getHistory();
            const existIdx = history.findIndex(item => item.flightno === flightno);
            if (existIdx !== -1) history[existIdx] = flightData;
            else history.unshift(flightData);
            saveHistory(history);
            renderHistory();

            showBanner(flightData);
            document.getElementById('fp-modal').style.display = 'none';
        };

        document.getElementById('fp-end-flight-btn').onclick = function() {
            const banner = document.getElementById('fp-banner');
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(25px)';
            setTimeout(() => {
                banner.style.display = 'none';
                banner.style.pointerEvents = 'none';
            }, 600);

            document.getElementById('fp-airline').value = '';
            document.getElementById('fp-aircraft').value = '';
            document.getElementById('fp-departure').value = '';
            document.getElementById('fp-arrival').value = '';
            document.getElementById('fp-flightno').value = '';
        };

        document.getElementById('fp-modal').addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });

        return true;
    }

    // ------- 10. Polling Mount -------
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (initFlightPlanBtn() || attempts > 30) {
            clearInterval(interval);
            if (attempts <= 30) console.log("✅ GeoFS Flights plugin loaded successfully!");
        }
    }, 500);
})();
