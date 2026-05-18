// ==UserScript==
// @name         Advanced Geolocation Manager
// @namespace    https://github.com/kaerez/JSMonkey
// @version      4.5
// @description  Multi-profile async geolocation manager. Features file I/O, permission spoofing, and integrated diagnostics.
// @author       EK
// @match        *://*/*
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/GeoManager/advanced-geo-manager.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/GeoManager/advanced-geo-manager.user.js
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const STORE_KEY = 'GeoManagerProfiles_v4';
    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    
    // --- Native Hardware Capture ---
    const nativeGeolocation = targetWindow.navigator.geolocation;
    const nativeGetCurrentPosition = nativeGeolocation ? nativeGeolocation.getCurrentPosition.bind(nativeGeolocation) : null;
    const nativePermissionsQuery = targetWindow.navigator.permissions && targetWindow.navigator.permissions.query
        ? targetWindow.navigator.permissions.query.bind(targetWindow.navigator.permissions)
        : null;

    // --- Data Management ---
    let profiles = GM_getValue(STORE_KEY, []);
    const saveProfiles = () => GM_setValue(STORE_KEY, profiles);

    // --- Matching Engine ---
    const matchPattern = (url, pattern) => {
        const escapeRegex = (str) => str.replace(/([.+?^=!:${}()|\[\]\/\\])/g, "\\$1");
        const regexStr = "^" + pattern.split('*').map(escapeRegex).join('.*') + "$";
        return new RegExp(regexStr).test(url);
    };

    const getActiveProfile = () => {
        const currentUrl = window.location.href;
        for (const profile of profiles) {
            if (!profile.enabled) continue;
            for (const rule of profile.rules) {
                if (rule.enabled && matchPattern(currentUrl, rule.pattern)) {
                    return profile;
                }
            }
        }
        return null;
    };

    // --- Core Spoofing Logic ---
    const activeProfile = getActiveProfile();

    if (activeProfile) {
        const c = activeProfile.coords;
        const fakeGeo = {
            coords: {
                latitude: Number(c.latitude), longitude: Number(c.longitude),
                accuracy: c.accuracy.isNull ? null : Number(c.accuracy.value),
                altitude: c.altitude.isNull ? null : Number(c.altitude.value),
                altitudeAccuracy: c.altitudeAccuracy.isNull ? null : Number(c.altitudeAccuracy.value),
                heading: c.heading.isNull ? null : Number(c.heading.value),
                speed: c.speed.isNull ? null : Number(c.speed.value)
            },
            timestamp: Date.now()
        };

        const mockGeolocation = {
            getCurrentPosition: function(success, error, options) {
                setTimeout(() => {
                    if (activeProfile.permissionState === 'denied') {
                        if (typeof error === 'function') error({ code: 1, message: "User denied Geolocation" });
                        return;
                    }
                    if (typeof success === 'function') { fakeGeo.timestamp = Date.now(); success(fakeGeo); }
                }, Math.floor(Math.random() * 400) + 300);
            },
            watchPosition: function(success, error, options) {
                setTimeout(() => {
                    if (activeProfile.permissionState === 'denied') {
                        if (typeof error === 'function') error({ code: 1, message: "User denied Geolocation" });
                        return;
                    }
                    if (typeof success === 'function') { fakeGeo.timestamp = Date.now(); success(fakeGeo); }
                }, Math.floor(Math.random() * 400) + 300);
                return Math.floor(Math.random() * 10000);
            },
            clearWatch: function(id) {}
        };

        if (targetWindow.navigator) {
            Object.defineProperty(targetWindow.navigator, 'geolocation', { value: mockGeolocation, configurable: true, enumerable: true, writable: true });
        }
        if (targetWindow.Navigator && targetWindow.Navigator.prototype) {
            Object.defineProperty(targetWindow.Navigator.prototype, 'geolocation', { get: function() { return mockGeolocation; }, configurable: true });
        }
        if (targetWindow.navigator.permissions && targetWindow.navigator.permissions.query) {
            const originalQuery = targetWindow.navigator.permissions.query;
            targetWindow.navigator.permissions.query = function(parameters) {
                if (parameters && parameters.name === 'geolocation') {
                    return Promise.resolve({ state: activeProfile.permissionState || 'granted', onchange: null, name: 'geolocation' });
                }
                return originalQuery.apply(this, arguments);
            };
        }
    }

    // --- DevConsole Diagnostics Export ---
    const logPositionDetails = (position) => {
        const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;
        return `<strong>Latitude:</strong> ${latitude}°<br/><strong>Longitude:</strong> ${longitude}°<br/><strong>Accuracy:</strong> ${accuracy} meters<br/><strong>Altitude:</strong> ${altitude !== null ? `${altitude} meters` : 'Not available'}<br/><strong>Altitude Accuracy:</strong> ${altitudeAccuracy !== null ? `${altitudeAccuracy} meters` : 'Not available'}<br/><strong>Heading:</strong> ${heading !== null ? `${heading}°` : 'Not available'}<br/><strong>Speed:</strong> ${speed !== null ? `${speed} m/s` : 'Not available'}<br/><strong>Timestamp:</strong> ${new Date(position.timestamp).toLocaleString()}`;
    };

    const fetchGeoAsync = (method) => {
        return new Promise((resolve) => {
            if (!method) { resolve(`<span class="text-error">Error: Method unavailable</span>`); return; }
            method(
                (position) => resolve(logPositionDetails(position)),
                (error) => resolve(`<span class="text-error"><strong>Error (${error.code}):</strong> ${error.message}${error.code === 1 ? `<br><br><div class="error-box">⚠️ <b>Hardware/Profile Blocked:</b> Location access denied.</div>` : ''}</span>`),
                { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
            );
        });
    };

    targetWindow.GeoSpoof = async () => {
        if (!activeProfile) return "No active profile matched for this domain. Geolocation is operating natively.";
        return "GeoSpoof Diagnostics running. Open the Advanced Geolocation Manager GUI to view detailed Unspoofed vs Spoofed comparisons.";
    };

    // --- GUI Engine (Only in top frame) ---
    if (window.self === window.top) {
        
        let isGuiBuilt = false;
        let openModalFunc = null;

        let ttPolicy;
        const setHTML = (el, htmlStr) => {
            if (window.trustedTypes && window.trustedTypes.createPolicy) {
                if (!ttPolicy) {
                    try { ttPolicy = window.trustedTypes.createPolicy('geoSpooferPolicy_v4', { createHTML: (s) => s }); } catch (e) {}
                }
                el.innerHTML = ttPolicy ? ttPolicy.createHTML(htmlStr) : htmlStr;
            } else {
                el.innerHTML = htmlStr;
            }
        };

        const buildGUI = () => {
            if (isGuiBuilt || !document.body) return;
            isGuiBuilt = true;

            const shadowHost = document.createElement('div');
            shadowHost.id = 'geospoof-manager-host';
            document.body.appendChild(shadowHost);
            const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

            const style = document.createElement('style');
            style.textContent = `
                :host { all: initial; font-family: system-ui, -apple-system, sans-serif; direction: ltr; text-align: left; color: #333; }
                * { box-sizing: border-box; }
                .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 999999; }
                .modal-content { width: 80vw; max-width: 850px; height: 80vh; background: #fff; border-radius: 8px; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; }
                .header { padding: 20px; background: #f8f9fa; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; }
                .header h2 { margin: 0; font-size: 20px; }
                .body { padding: 20px; overflow-y: auto; flex-grow: 1; }
                .footer { padding: 15px 20px; border-top: 1px solid #ddd; background: #fafafa; display: flex; justify-content: flex-end; gap: 10px; }
                
                button { padding: 8px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: opacity 0.2s; }
                button:hover { opacity: 0.8; }
                button:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-primary { background: #0056b3; color: white; }
                .btn-success { background: #28a745; color: white; }
                .btn-danger { background: #dc3545; color: white; }
                .btn-secondary { background: #6c757d; color: white; }
                .btn-info { background: #17a2b8; color: white; }
                .btn-outline { background: transparent; border: 1px solid #ccc; color: #333; }

                .profile-card { border: 1px solid #ddd; border-radius: 6px; padding: 15px; margin-bottom: 15px; background: #fff; display: flex; justify-content: space-between; align-items: center; }
                .profile-info h3 { margin: 0 0 5px 0; display: flex; align-items: center; gap: 10px; }
                .profile-info p { margin: 0; font-size: 13px; color: #666; }
                .profile-actions { display: flex; gap: 8px; }

                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 14px; }
                .form-control { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
                select.form-control { background: #fff; }
                
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                .param-row { display: flex; align-items: center; gap: 10px; border: 1px solid #eee; padding: 8px; border-radius: 4px; background: #fafafa; }
                .param-row label { flex: 1; margin: 0; font-weight: 500; }
                .param-row .unit { width: 60px; color: #666; font-size: 13px; }
                .param-row input[type="number"] { width: 100px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; }
                
                .rule-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
                .rule-row input[type="text"] { flex-grow: 1; }

                .syntax-help { font-size: 12px; color: #555; background: #e9ecef; padding: 10px; border-radius: 4px; margin-top: 10px; line-height: 1.5; }
                .syntax-help code { background: #d6d8db; padding: 2px 4px; border-radius: 3px; }

                .toggle-switch { display: inline-flex; align-items: center; cursor: pointer; gap: 8px; }
                textarea { width: 100%; height: 300px; font-family: monospace; padding: 10px; border: 1px solid #ccc; border-radius: 4px; resize: none; }

                .results-container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .result-pane { background: #f4f4f4; padding: 15px; border-radius: 5px; border: 1px solid #ddd; line-height: 1.6; }
                .result-pane h3 { margin-top: 0; padding-bottom: 8px; border-bottom: 1px solid #ddd; }
                .perm-badge { margin-bottom: 15px; font-size: 13px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; }
                .text-error { color: #d9534f; line-height: 1.5; display: inline-block; }
                .error-box { background:#fff3cd; color:#856404; padding:10px; border-radius:4px; font-size:13px; border: 1px solid #ffeeba; }

                .context-menu { position: fixed; z-index: 999999; background: #fff; border: 1px solid #ccc; padding: 8px 12px; border-radius: 4px; box-shadow: 2px 2px 6px rgba(0,0,0,0.2); cursor: pointer; font-size: 14px; color: #333; transition: background 0.2s; }
                .context-menu:hover { background: #f0f0f0; }
            `;
            shadowRoot.appendChild(style);

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            
            const content = document.createElement('div');
            content.className = 'modal-content';
            
            setHTML(content, `
                <div class="header">
                    <h2 id="modal-title">Advanced Geolocation Manager</h2>
                    <button class="btn-outline" id="close-btn">✕ Close</button>
                </div>
                <div class="body" id="modal-body"></div>
                <div class="footer" id="modal-footer"></div>
            `);
            
            overlay.appendChild(content);
            shadowRoot.appendChild(overlay);

            const modalBody = shadowRoot.getElementById('modal-body');
            const modalFooter = shadowRoot.getElementById('modal-footer');
            const modalTitle = shadowRoot.getElementById('modal-title');

            openModalFunc = () => { overlay.style.display = 'flex'; renderList(); };
            const closeModal = () => { overlay.style.display = 'none'; };
            
            shadowRoot.getElementById('close-btn').addEventListener('click', closeModal);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

            const renderList = () => {
                modalTitle.innerText = "Geo Manager Profiles";
                setHTML(modalBody, `
                    <div style="margin-bottom: 20px; display: flex; gap: 10px;">
                        <button class="btn-primary" id="btn-add-profile">+ Add Profile</button>
                        <button class="btn-info" id="btn-diagnostics">📊 Run Diagnostics</button>
                        <button class="btn-secondary" id="btn-export-all">Export All</button>
                        <button class="btn-secondary" id="btn-import-all">Import All</button>
                    </div>
                    <div id="profiles-container"></div>
                `);
                setHTML(modalFooter, '');

                const container = shadowRoot.getElementById('profiles-container');
                if (profiles.length === 0) setHTML(container, `<p>No profiles found. Click "+ Add Profile" to begin.</p>`);

                profiles.forEach((p, index) => {
                    const activeRuleCount = p.rules.filter(r => r.enabled).length;
                    const el = document.createElement('div');
                    el.className = 'profile-card';
                    setHTML(el, `
                        <div class="profile-info">
                            <h3>
                                <input type="checkbox" class="profile-toggle" data-idx="${index}" ${p.enabled ? 'checked' : ''} title="Enable/Disable Profile">
                                ${p.name}
                            </h3>
                            <p>${p.coords.latitude}°, ${p.coords.longitude}° | Perm: ${p.permissionState || 'granted'} | ${activeRuleCount} rules</p>
                        </div>
                        <div class="profile-actions">
                            <button class="btn-outline btn-edit" data-idx="${index}">Edit</button>
                            <button class="btn-outline btn-export" data-idx="${index}">Export</button>
                            <button class="btn-danger btn-delete" data-idx="${index}">Delete</button>
                        </div>
                    `);
                    container.appendChild(el);
                });

                shadowRoot.getElementById('btn-add-profile').onclick = () => renderEdit(-1);
                shadowRoot.getElementById('btn-diagnostics').onclick = renderDiagnostic;
                shadowRoot.getElementById('btn-export-all').onclick = () => renderImportExport(null, 'export');
                shadowRoot.getElementById('btn-import-all').onclick = () => renderImportExport(null, 'import');

                container.querySelectorAll('.profile-toggle').forEach(chk => { chk.onchange = (e) => { profiles[e.target.dataset.idx].enabled = e.target.checked; saveProfiles(); }; });
                container.querySelectorAll('.btn-edit').forEach(btn => { btn.onclick = (e) => { renderEdit(e.target.dataset.idx); }; });
                container.querySelectorAll('.btn-export').forEach(btn => { btn.onclick = (e) => { renderImportExport(e.target.dataset.idx, 'export'); }; });
                container.querySelectorAll('.btn-delete').forEach(btn => { btn.onclick = (e) => { profiles.splice(e.target.dataset.idx, 1); saveProfiles(); renderList(); }; });
            };

            const renderEdit = (index) => {
                const isNew = index === -1;
                const p = isNew ? {
                    name: "New Profile", enabled: true, permissionState: 'granted',
                    coords: {
                        latitude: 0, longitude: 0,
                        accuracy: { value: 50, isNull: false }, altitude: { value: 0, isNull: false },
                        altitudeAccuracy: { value: 0, isNull: true }, heading: { value: 0, isNull: true }, speed: { value: 0, isNull: true }
                    },
                    rules: [{ pattern: "*://*.example.com/*", enabled: true }]
                } : JSON.parse(JSON.stringify(profiles[index]));

                modalTitle.innerText = isNew ? "Create Profile" : "Edit Profile";
                
                const buildParam = (id, label, unit, data) => `
                    <div class="param-row">
                        <label>${label}</label>
                        <label class="toggle-switch" style="font-size: 13px;">
                            <input type="checkbox" id="edit-null-${id}" ${data.isNull ? 'checked' : ''} onchange="document.getElementById('edit-val-${id}').disabled = this.checked"> Null?
                        </label>
                        <input type="number" id="edit-val-${id}" step="any" value="${data.value}" ${data.isNull ? 'disabled' : ''}>
                        <span class="unit">${unit}</span>
                    </div>
                `;

                setHTML(modalBody, `
                    <div class="form-group" style="display: flex; gap: 15px;">
                        <div style="flex-grow: 1;">
                            <label>Profile Name</label>
                            <input type="text" id="edit-name" class="form-control" value="${p.name}">
                        </div>
                        <div style="width: 200px;">
                            <label>Spoofed Permission</label>
                            <select id="edit-perm" class="form-control">
                                <option value="granted" ${p.permissionState === 'granted' ? 'selected' : ''}>Granted (Allowed)</option>
                                <option value="prompt" ${p.permissionState === 'prompt' ? 'selected' : ''}>Prompt (Ask)</option>
                                <option value="denied" ${p.permissionState === 'denied' ? 'selected' : ''}>Denied</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <label style="font-weight: bold; font-size: 14px; margin: 0;">Coordinates</label>
                        <button class="btn-info" id="btn-fetch-real" style="font-size: 12px; padding: 5px 10px;">📍 Fetch Current Real Location</button>
                    </div>

                    <div class="form-group grid-2">
                        <div>
                            <label>Latitude (°)</label>
                            <input type="number" id="edit-lat" class="form-control" step="any" value="${p.coords.latitude}">
                        </div>
                        <div>
                            <label>Longitude (°)</label>
                            <input type="number" id="edit-lng" class="form-control" step="any" value="${p.coords.longitude}">
                        </div>
                    </div>
                    <div class="form-group grid-2">
                        ${buildParam('acc', 'Accuracy', 'meters', p.coords.accuracy)}
                        ${buildParam('alt', 'Altitude', 'meters', p.coords.altitude)}
                        ${buildParam('altacc', 'Alt. Accuracy', 'meters', p.coords.altitudeAccuracy)}
                        ${buildParam('head', 'Heading', '°', p.coords.heading)}
                        ${buildParam('speed', 'Speed', 'm/s', p.coords.speed)}
                    </div>
                    <div class="form-group">
                        <label>Target Websites (Match Patterns)</label>
                        <div id="rules-list"></div>
                        <button class="btn-secondary" id="btn-add-rule" style="margin-top: 10px; font-size: 12px;">+ Add Rule</button>
                        <div class="syntax-help">
                            <strong>Syntax Help:</strong> Use <code>*</code> as a wildcard. <br>
                            • <code>https://test.example.com/*</code> (Matches exact domain, any path. Does NOT match https://www.example.com or https://example.com)<br>
                            • <code>*://*.example.com/*</code> (Matches HTTP/HTTPS and any subdomain. Does NOT match https://example.com)
                        </div>
                    </div>
                `);

                shadowRoot.getElementById('btn-fetch-real').onclick = (e) => {
                    const btn = e.target;
                    btn.innerText = "Fetching...";
                    btn.disabled = true;
                    
                    if (!nativeGetCurrentPosition) {
                        alert("Native Geolocation method not found. Cannot fetch.");
                        btn.innerText = "📍 Fetch Current Real Location";
                        btn.disabled = false;
                        return;
                    }

                    nativeGetCurrentPosition(
                        (pos) => {
                            shadowRoot.getElementById('edit-lat').value = pos.coords.latitude;
                            shadowRoot.getElementById('edit-lng').value = pos.coords.longitude;
                            
                            const setParam = (id, val) => {
                                const isNull = val === null;
                                shadowRoot.getElementById(`edit-null-${id}`).checked = isNull;
                                shadowRoot.getElementById(`edit-val-${id}`).disabled = isNull;
                                if (!isNull) shadowRoot.getElementById(`edit-val-${id}`).value = val;
                            };

                            setParam('acc', pos.coords.accuracy);
                            setParam('alt', pos.coords.altitude);
                            setParam('altacc', pos.coords.altitudeAccuracy);
                            setParam('head', pos.coords.heading);
                            setParam('speed', pos.coords.speed);

                            btn.innerText = "✅ Success!";
                            setTimeout(() => { btn.innerText = "📍 Fetch Current Real Location"; btn.disabled = false; }, 2000);
                        },
                        (err) => {
                            alert(`Hardware Error (${err.code}): ${err.message}\nMake sure your browser is allowing location access to this website.`);
                            btn.innerText = "📍 Fetch Current Real Location";
                            btn.disabled = false;
                        },
                        { enableHighAccuracy: true, timeout: 10000 }
                    );
                };

                const rulesList = shadowRoot.getElementById('rules-list');
                const renderRules = () => {
                    setHTML(rulesList, '');
                    p.rules.forEach((r, i) => {
                        const row = document.createElement('div');
                        row.className = 'rule-row';
                        setHTML(row, `
                            <input type="checkbox" class="rule-enable" data-idx="${i}" ${r.enabled ? 'checked' : ''} title="Enable Rule">
                            <input type="text" class="form-control rule-pattern" data-idx="${i}" value="${r.pattern}">
                            <button class="btn-danger btn-del-rule" data-idx="${i}">✕</button>
                        `);
                        rulesList.appendChild(row);
                    });
                    
                    rulesList.querySelectorAll('.rule-enable').forEach(el => { el.onchange = e => { p.rules[e.target.dataset.idx].enabled = e.target.checked; }; });
                    rulesList.querySelectorAll('.rule-pattern').forEach(el => { el.oninput = e => { p.rules[e.target.dataset.idx].pattern = e.target.value; }; });
                    rulesList.querySelectorAll('.btn-del-rule').forEach(el => { el.onclick = e => { p.rules.splice(e.target.dataset.idx, 1); renderRules(); }; });
                };
                renderRules();
                
                shadowRoot.getElementById('btn-add-rule').onclick = () => { p.rules.push({ pattern: "*://*/*", enabled: true }); renderRules(); };

                setHTML(modalFooter, `<button class="btn-outline" id="btn-cancel">Cancel</button><button class="btn-success" id="btn-save">Save Profile</button>`);

                shadowRoot.getElementById('btn-cancel').onclick = renderList;
                shadowRoot.getElementById('btn-save').onclick = () => {
                    const getP = (id) => ({
                        isNull: shadowRoot.getElementById(`edit-null-${id}`).checked,
                        value: shadowRoot.getElementById(`edit-val-${id}`).value
                    });

                    p.name = shadowRoot.getElementById('edit-name').value;
                    p.permissionState = shadowRoot.getElementById('edit-perm').value;
                    p.coords.latitude = shadowRoot.getElementById('edit-lat').value;
                    p.coords.longitude = shadowRoot.getElementById('edit-lng').value;
                    p.coords.accuracy = getP('acc');
                    p.coords.altitude = getP('alt');
                    p.coords.altitudeAccuracy = getP('altacc');
                    p.coords.heading = getP('head');
                    p.coords.speed = getP('speed');

                    if (isNew) profiles.push(p); else profiles[index] = p;
                    saveProfiles(); renderList();
                };
            };

            const renderDiagnostic = async () => {
                modalTitle.innerText = "Geolocation Diagnostics";
                
                setHTML(modalBody, `
                    <p style="margin-top:0; color:#666;">Comparing Native Hardware API vs Currently Active Spoofed Profile on this domain.</p>
                    <div class="results-container">
                        <div id="unspoofed-pane" class="result-pane"><h3>Unspoofed (Native)</h3><p><em>Loading... (Awaiting hardware)</em></p></div>
                        <div id="spoofed-pane" class="result-pane"><h3>Spoofed (Mocked)</h3><p><em>Loading...</em></p></div>
                    </div>
                `);
                setHTML(modalFooter, `<button class="btn-outline" id="btn-back">← Back to Profiles</button>`);
                shadowRoot.getElementById('btn-back').onclick = renderList;

                const unspooofedPane = shadowRoot.getElementById('unspoofed-pane');
                const spoofedPane = shadowRoot.getElementById('spoofed-pane');

                let permStatusHtml = "";
                if (nativePermissionsQuery) {
                    try {
                        const permStatus = await nativePermissionsQuery({name: 'geolocation'});
                        const color = permStatus.state === 'granted' ? '#28a745' : (permStatus.state === 'denied' ? '#dc3545' : '#fd7e14');
                        permStatusHtml = `<div class="perm-badge"><strong>Hardware Permission State:</strong> <span style="color: ${color}; font-weight: bold; text-transform: uppercase;">${permStatus.state}</span></div>`;
                    } catch (e) {}
                }

                const nativeData = await fetchGeoAsync(nativeGetCurrentPosition);
                setHTML(unspooofedPane, `<h3>Unspoofed (Native)</h3>${permStatusHtml}${nativeData}`);
                
                const mockedPermState = activeProfile ? activeProfile.permissionState : 'UNMATCHED (Native)';
                const spoofColor = mockedPermState === 'granted' ? '#28a745' : (mockedPermState === 'denied' ? '#dc3545' : '#fd7e14');
                const mockPermStatusHtml = `<div class="perm-badge"><strong>Mocked Permission State:</strong> <span style="color: ${spoofColor}; font-weight: bold; text-transform: uppercase;">${mockedPermState}</span></div>`;

                const spoofedData = await fetchGeoAsync(targetWindow.navigator.geolocation.getCurrentPosition.bind(targetWindow.navigator.geolocation));
                setHTML(spoofedPane, `<h3>Spoofed (Mocked)</h3>${mockPermStatusHtml}${spoofedData}`);
            };

            const renderImportExport = (index, mode) => {
                const isSingle = index !== null;
                modalTitle.innerText = mode === 'export' ? "Export Config" : "Import Config";
                
                let outputStr = mode === 'export' ? JSON.stringify(isSingle ? [profiles[index]] : profiles, null, 2) : "";

                setHTML(modalBody, `
                    <p style="margin-top:0; color:#666;">${mode === 'export' ? 'Copy or download the JSON below:' : 'Paste your JSON array or upload a file to import:'}</p>
                    <textarea id="io-textarea" ${mode === 'export' ? 'readonly' : ''}>${outputStr}</textarea>
                `);

                setHTML(modalFooter, `
                    <button class="btn-outline" id="btn-cancel">Cancel</button>
                    ${mode === 'export' 
                        ? `<button class="btn-primary" id="btn-copy">Copy to Clipboard</button>
                           <button class="btn-success" id="btn-download">Download .json</button>` 
                        : `<input type="file" id="file-import" accept=".json" style="display:none;">
                           <button class="btn-primary" id="btn-browse" onclick="document.getElementById('geospoof-manager-host').shadowRoot.getElementById('file-import').click()">Browse File...</button>
                           <button class="btn-success" id="btn-import">Apply Import</button>`}
                `);

                shadowRoot.getElementById('btn-cancel').onclick = renderList;
                
                if (mode === 'export') {
                    shadowRoot.getElementById('btn-copy').onclick = () => {
                        shadowRoot.getElementById('io-textarea').select();
                        document.execCommand('copy');
                    };
                    shadowRoot.getElementById('btn-download').onclick = () => {
                        const blob = new Blob([outputStr], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `geospoof_${isSingle ? 'profile' : 'all'}_${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                    };
                } else {
                    shadowRoot.getElementById('file-import').onchange = (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => { shadowRoot.getElementById('io-textarea').value = ev.target.result; };
                        reader.readAsText(file);
                    };

                    shadowRoot.getElementById('btn-import').onclick = () => {
                        try {
                            const input = JSON.parse(shadowRoot.getElementById('io-textarea').value);
                            if (!Array.isArray(input)) throw new Error("Must be an array of profiles");
                            profiles = [...profiles, ...input];
                            saveProfiles(); renderList();
                        } catch(e) {
                            shadowRoot.getElementById('io-textarea').value = "INVALID JSON FORMAT!\n\n" + e.message;
                        }
                    };
                }
            };
        };

        const executeOpenRequest = () => {
            if (!isGuiBuilt) buildGUI();
            if (openModalFunc) openModalFunc();
        };

        GM_registerMenuCommand("📍 Advanced Geolocation Manager", executeOpenRequest);

        document.addEventListener('contextmenu', (e) => {
            if (!isGuiBuilt) buildGUI();
            const host = document.getElementById('geospoof-manager-host');
            if (!host || !host.shadowRoot) return;
            const shadowRoot = host.shadowRoot;

            const existing = shadowRoot.getElementById('geo-context-menu');
            if (existing) existing.remove();

            const menu = document.createElement('div');
            menu.id = 'geo-context-menu';
            menu.className = 'context-menu';
            setHTML(menu, "📍 Advanced Geolocation Manager");
            menu.style.top = `${e.clientY}px`;
            menu.style.left = `${e.clientX + 10}px`;

            menu.addEventListener('click', () => { menu.remove(); executeOpenRequest(); });
            shadowRoot.appendChild(menu);

            const cleanup = () => menu.remove();
            document.addEventListener('click', cleanup, { once: true });
            document.addEventListener('scroll', cleanup, { once: true });
            setTimeout(() => { if (shadowRoot.contains(menu)) menu.remove(); }, 3000);
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', buildGUI);
        } else {
            buildGUI();
        }
    }
})();
