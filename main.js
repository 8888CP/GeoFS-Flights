// ==UserScript==
// @name         GeoFS Flights
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Fixed bottom bar, popup entry, draggable banner, Logo loaded from remote JSON.
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const LOGO_JSON_URL = "https://raw.githubusercontent.com/8888CP/GeoFS-Flights/refs/heads/main/Airlines.json";
    const FALLBACK_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Ctext x='75' y='82' font-family='Arial' font-size='28' text-anchor='middle' fill='%23666'%3ELOGO%3C/text%3E%3C/svg%3E";

    let logoData = [];
    let isBannerActive = false;
    let hideTimeoutId = null;

    async function loadLogoJSON() {
        try {
            const resp = await fetch(LOGO_JSON_URL);
            if (resp.ok) {
                logoData = await resp.json();
            }
        } catch (e) {}
    }
    loadLogoJSON();

    function getHistory() {
        try { return JSON.parse(localStorage.getItem('fp_history')) || []; } catch(e) { return []; }
    }
    function saveHistory(data) { localStorage.setItem('fp_history', JSON.stringify(data)); }

    let flightStartTime = null;
    let flightTimerInterval = null;

    function formatFlightTime(ms) {
        if (!ms) return '0 minutes';
        const totalSeconds = Math.floor(ms / 1000);
        const totalMinutes = Math.floor(totalSeconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours === 0 && minutes === 0) return '0 minutes';

        let parts = [];
        if (hours > 0) {
            parts.push(hours + ' hour' + (hours > 1 ? 's' : ''));
        }
        if (minutes > 0) {
            parts.push(minutes + ' minute' + (minutes > 1 ? 's' : ''));
        }
        return parts.join(' ');
    }

    function updateTimerDisplay() {
        if (!flightStartTime) {
            const el = document.getElementById('fp-time-display');
            if (el) el.textContent = '0 minutes';
            return;
        }
        const elapsed = Date.now() - flightStartTime;
        const el = document.getElementById('fp-time-display');
        if (el) {
            el.textContent = formatFlightTime(elapsed);
        }
    }

    function startFlightTimer() {
        if (flightTimerInterval) clearInterval(flightTimerInterval);
        flightStartTime = Date.now();
        updateTimerDisplay();
        flightTimerInterval = setInterval(updateTimerDisplay, 1000);
    }

    function stopFlightTimer() {
        if (flightTimerInterval) {
            clearInterval(flightTimerInterval);
            flightTimerInterval = null;
        }
        flightStartTime = null;
        const el = document.getElementById('fp-time-display');
        if (el) el.textContent = '0 minutes';
    }

    const style = document.createElement('style');
    style.textContent = `
        #fp-modal { transition: opacity 0.3s ease; z-index: 9999; }
        #fp-modal input:focus { outline: none; border-color: #1976d2 !important; }
        #fp-btn { font-weight: 400; letter-spacing: 0.5px; }

        #fp-banner {
            display: none;
            position: fixed;
            left: 20px;
            bottom: 70px;
            resize: both;
            overflow: auto;
            width: auto;
            height: auto;
            min-width: 400px;
            min-height: 100px;
            max-width: 90vw;
            max-height: 90vh;
            z-index: 9998;
            background: transparent;
            padding: 0;
            cursor: grab;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            transition: opacity 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #fp-banner:active { cursor: grabbing; }
        #fp-banner::-webkit-scrollbar { width: 8px; height: 8px; }
        #fp-banner::-webkit-scrollbar-track { background: transparent; }
        #fp-banner::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
        #fp-banner::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
        #fp-banner::-webkit-scrollbar-corner { background: transparent; }

        .fp-banner-inner {
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            background: #ffffff;
            padding: 8px 18px;
            border-radius: 6px;
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            pointer-events: none;
        }
        #fp-end-flight-btn { pointer-events: auto; }

        .fp-history-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; margin-bottom: 6px; background: #333; border-radius: 4px; cursor: pointer; transition: 0.2s; }
        .fp-history-item:hover { background: #444; }
        .fp-history-item .fp-del { color: #d32f2f; font-weight: bold; margin-left: 10px; cursor: pointer; font-size: 18px; flex-shrink: 0; }
        .fp-history-item .fp-del:hover { color: #ff5252; }
        #fp-history-list { max-height: 150px; overflow-y: auto; margin-top: 10px; }
        #fp-history-list::-webkit-scrollbar { width: 6px; }
        #fp-history-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
    `;
    document.head.appendChild(style);

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
                <h3 style="margin-top:0; text-align:center; color:#fff; font-weight:400; letter-spacing:1px;">Flight</h3>
                <input id="fp-airline" autocomplete="off" placeholder="Airline (e.g., Sichuan Airlines)" style="width:100%; margin-bottom:10px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <input id="fp-aircraft" autocomplete="off" placeholder="Aircraft (e.g., A320-214)" style="width:100%; margin-bottom:10px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <input id="fp-departure" autocomplete="off" placeholder="Departure (e.g., Beijing Daxing)" style="width:100%; margin-bottom:10px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <input id="fp-arrival" autocomplete="off" placeholder="Arrival (e.g., Chengdu Shuangliu)" style="width:100%; margin-bottom:10px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
                <input id="fp-flightno" autocomplete="off" placeholder="Flight No. (e.g., 3U6687)" style="width:100%; margin-bottom:15px; padding:10px; background:#333; border:1px solid #555; color:#fff; border-radius:4px; box-sizing:border-box;">
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
            <div id="fp-banner">
                <div class="fp-banner-inner">
                    <div style="flex-shrink:0; display:flex; align-items:center; justify-content:center; width:150px; height:150px; margin-right:0px; background:transparent; border-radius:4px; overflow:hidden;">
                        <img id="fp-logo" src="" style="width:100%; height:100%; object-fit:contain; display:block;">
                    </div>
                    <div style="flex-shrink:0; width:3px; height:60px; background:#c62828; margin-right:16px;"></div>
                    <div style="flex:1 1 auto; min-width:0; display:flex; flex-direction:column; justify-content:space-between; height:56px; margin-right:15px;">
                        <div id="fp-flightno-display" style="font-size:24px; font-weight:600; color:#222; line-height:1; white-space:nowrap;">3U6687</div>
                        <div id="fp-route-en" style="font-size:14px; color:#444; line-height:1.2; margin-top:6px; white-space:nowrap;">Beijing Daxing - Chengdu Shuangliu</div>
                    </div>
                    <div style="flex:1 1 auto; min-width:0; display:flex; align-items:center; justify-content:center; height:56px; margin-right:15px; border-left:1px solid #bbb; padding-left:15px;">
                        <div id="fp-aircraft-display" style="font-size:16px; color:#333; line-height:1.2; white-space:nowrap;">Airbus A380</div>
                    </div>
                    <div style="flex:1 1 auto; min-width:0; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; height:56px; margin-right:15px; border-left:1px solid #bbb; padding-left:15px;">
                        <div style="font-size:11px; color:#666; font-weight:500; margin-bottom:2px;">TIME</div>
                        <div id="fp-time-display" style="font-weight:600; font-size:16px; color:#333; white-space: nowrap;">0 minutes</div>
                    </div>
                    <button id="fp-end-flight-btn" style="flex-shrink:0; padding:8px 15px; background:#d32f2f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:14px; pointer-events:auto;">End Flight</button>
                </div>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', bannerHTML);
        }

        const inputIds = ['fp-airline', 'fp-aircraft', 'fp-departure', 'fp-arrival', 'fp-flightno'];
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('keydown', function(e) { e.stopImmediatePropagation(); });
                el.addEventListener('keyup', function(e) { e.stopImmediatePropagation(); });
            }
        });

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
                    if (hideTimeoutId) {
                        clearTimeout(hideTimeoutId);
                        hideTimeoutId = null;
                    }
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
                    if (isBannerActive) {
                        const currentNo = document.getElementById('fp-flightno-display').textContent;
                        if (currentNo === item.flightno) {
                            hideBanner();
                        }
                    }
                };
                div.appendChild(span);
                div.appendChild(del);
                list.appendChild(div);
            });
        }

        // ========== 全新、更精准的 Logo 匹配函数 ==========
        function findBestMatch(airlineName, logoData) {
            let normalizedInput = airlineName.toLowerCase().trim();
            let inputWords = normalizedInput.split(/\s+/).filter(w => w.length > 0);

            // 1. 完全相等
            let matched = logoData.find(entry => entry.airline.toLowerCase().trim() === normalizedInput);
            if (matched) return matched;

            // 2. 单词完全匹配（按空格分词，任意单词相等）
            if (inputWords.length > 0) {
                matched = logoData.find(entry => {
                    let entryWords = entry.airline.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                    return inputWords.some(inputWord => entryWords.some(entryWord => inputWord === entryWord));
                });
                if (matched) return matched;
            }

            // 3. 前缀匹配（整个字符串）
            matched = logoData.find(entry => {
                let entryName = entry.airline.toLowerCase().trim();
                return entryName.startsWith(normalizedInput) || normalizedInput.startsWith(entryName);
            });
            if (matched) return matched;

            // 4. 回退：包含匹配（最低优先级）
            return logoData.find(entry => {
                let entryName = entry.airline.toLowerCase();
                return entryName.includes(normalizedInput) || normalizedInput.includes(entryName);
            });
        }

        function showBanner(item) {
            const banner = document.getElementById('fp-banner');
            if (!banner) return;
            if (hideTimeoutId) {
                clearTimeout(hideTimeoutId);
                hideTimeoutId = null;
            }

            isBannerActive = true;
            banner.style.left = '20px';
            banner.style.bottom = '70px';
            banner.style.top = 'auto';
            banner.style.width = 'auto';
            banner.style.height = 'auto';

            let logoUrl = FALLBACK_LOGO;
            if (logoData && logoData.length > 0) {
                const airlineName = (item.airline || '').trim();
                const matched = findBestMatch(airlineName, logoData);
                if (matched) logoUrl = matched.logo;
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
            document.getElementById('fp-aircraft-display').textContent = item.aircraft || '';

            const timeDisplay = document.getElementById('fp-time-display');
            if (item.duration) {
                timeDisplay.textContent = item.duration;
            } else {
                if (flightStartTime) updateTimerDisplay();
                else timeDisplay.textContent = '0 minutes';
            }

            banner.style.display = 'block';
            banner.style.transition = 'none';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(25px)';
            banner.style.pointerEvents = 'none';
            void banner.offsetHeight;

            requestAnimationFrame(() => {
                banner.style.transition = 'opacity 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                banner.style.opacity = '1';
                banner.style.transform = 'translateY(0)';
                banner.style.pointerEvents = 'auto';
            });
        }
        // ==================================================

        function hideBanner() {
            if (hideTimeoutId) {
                clearTimeout(hideTimeoutId);
                hideTimeoutId = null;
            }
            const banner = document.getElementById('fp-banner');
            if (!banner) return;
            isBannerActive = false;
            banner.style.transition = 'opacity 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(25px)';
            hideTimeoutId = setTimeout(() => {
                if (!isBannerActive) {
                    banner.style.display = 'none';
                    banner.style.pointerEvents = 'none';
                }
                hideTimeoutId = null;
            }, 600);
        }

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
                    bannerEl.style.transition = 'opacity 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                }
            });
        }
        initDragListeners();

        fpBtn.onclick = function(e) {
            e.stopPropagation();
            const modal = document.getElementById('fp-modal');
            if (modal && modal.style.display === 'block') {
                modal.style.display = 'none';
                return;
            }
            if (isBannerActive) {
                hideBanner();
                return;
            }
            modal.style.display = 'block';
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

            startFlightTimer();
            showBanner(flightData);
            document.getElementById('fp-modal').style.display = 'none';
        };

        document.getElementById('fp-end-flight-btn').onclick = function() {
            const currentFlightNo = document.getElementById('fp-flightno-display').textContent;
            if (flightStartTime && currentFlightNo && currentFlightNo !== '------') {
                let history = getHistory();
                const idx = history.findIndex(item => item.flightno === currentFlightNo);
                if (idx !== -1) {
                    const durationStr = formatFlightTime(Date.now() - flightStartTime);
                    history[idx].duration = durationStr;
                    saveHistory(history);
                    renderHistory();
                }
            }
            stopFlightTimer();
            hideBanner();
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

    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (document.querySelector('button[data-toggle-panel=".geofs-aircraft-list"]')) {
            if (initFlightPlanBtn()) {
                clearInterval(interval);
            }
        } else if (attempts > 60) {
            clearInterval(interval);
        }
    }, 500);
})();
