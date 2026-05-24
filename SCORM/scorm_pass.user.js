// ============================================
// SCORM/scorm_pass.user.js
// ============================================

// ==UserScript==
// @name         SCORM Pass Universal Hook Menu
// @namespace    https://github.com/kaerez/JSMonkey
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @version      4.1
// @description  Universal tracking proxy hook supporting SCORM 1.2/2004, xAPI, cmi5, Udutu, and BSI. Persistent re-hooking across SPA/iframe navigation. D2L coverage limited to SCORM content delivery only.
// @author       EK
// @license      AGPL-3.0-or-later
// @match        *://*/*
// @grant        GM.registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // =======================================================
    // CONFIGURATION UTILITIES & DEFENSIVE SHIELDS
    // =======================================================
    const secureHook = (obj, methodName, proxyFunc) => {
        try {
            Object.defineProperty(obj, methodName, {
                value: proxyFunc,
                writable: false,
                configurable: true
            });
        } catch (e) {
            obj[methodName] = proxyFunc;
        }
    };

    // =======================================================
    // SHARED HELPER: D2L / BSI OBJECT SANITIZER
    // Used by L4A (postMessage) and L4B (namespace hooks).
    // =======================================================
    function sanitizeD2LObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (obj.completion  !== undefined) obj.completion  = true;
        if (obj.isCompleted !== undefined) obj.isCompleted = true;
        if (obj.completed   !== undefined) obj.completed   = true;
        if (obj.progress    !== undefined) obj.progress    = 1.0;
        if (obj.success     !== undefined) obj.success     = true;
        if (obj.status      !== undefined && typeof obj.status === 'string') obj.status = 'completed';
        if (obj.CompletionStatus !== undefined) obj.CompletionStatus = 'Completed';
        if (obj.IsCompleted      !== undefined) obj.IsCompleted      = true;
        if (obj.ScoreNumerator   !== undefined && obj.ScoreDenominator !== undefined) {
            obj.ScoreNumerator = obj.ScoreDenominator;
        }
        // BSI fields
        if (obj.CompletionType !== undefined) obj.CompletionType = 2;
        if (obj.IsExempt       !== undefined) obj.IsExempt       = false;
        if (obj.score !== undefined) {
            if (typeof obj.score === 'object') {
                if (obj.score.scaled !== undefined) obj.score.scaled = 1.0;
                if (obj.score.raw    !== undefined) obj.score.raw    = 100;
                if (obj.score.min    !== undefined) obj.score.min    = 0;
                if (obj.score.max    !== undefined) obj.score.max    = 100;
            } else if (typeof obj.score === 'number') {
                obj.score = 100;
            }
        }
        return obj;
    }

    // =======================================================
    // LAYER 2A: SCORM API LOCATOR
    // =======================================================
    function findLmsDataBus(win) {
        try {
            if (win.API_1484_11) return { version: "2004", target: win.API_1484_11 };
            if (win.API)         return { version: "1.2",  target: win.API };
        } catch(e) {}
        try { if (win.parent && win.parent !== win) return findLmsDataBus(win.parent); } catch(e) {}
        try { if (win.opener) return findLmsDataBus(win.opener); } catch(e) {}
        return null;
    }

    // =======================================================
    // LAYER 2B: SCORM HOOK APPLICATION — IDEMPOTENT, REUSABLE
    // Called by activateScormPass AND the passive API watcher.
    // suspendFn: optional function returning suspend_data string.
    // =======================================================
    function applyScormHooksTo(version, api, suspendFn) {
        if (!api) return;
        if (api.__scormPassHooked) return;

        const sf = (typeof suspendFn === 'function') ? suspendFn : (() => "completed");

        if (version === "2004") {
            const _origSet = api.SetValue;
            if (typeof _origSet !== 'function') return;

            secureHook(api, 'SetValue', function(element, value) {
                if (element.includes("score.raw") || element.includes("score.scaled")) {
                    value = element.includes("scaled") ? 1.0 : 100;
                }
                if (element.includes("progress_measure"))   value = 1.0;
                if (element.includes("suspend_data"))        value = sf();
                if (element.includes("objectives.") && (element.includes("success_status") || element.includes("completion_status"))) {
                    value = element.includes("success") ? "passed" : "completed";
                }
                if (element.includes("session_time"))      value = "PT0H45M22S";
                if (element.includes("success_status"))    value = "passed";
                if (element.includes("completion_status")) value = "completed";
                return _origSet.call(api, element, value);
            });

            try {
                api.SetValue("cmi.score.scaled",      1.0);
                api.SetValue("cmi.score.raw",         100);
                api.SetValue("cmi.score.min",         0);
                api.SetValue("cmi.score.max",         100);
                api.SetValue("cmi.progress_measure",  1.0);
                api.SetValue("cmi.suspend_data",      sf());
                api.SetValue("cmi.session_time",      "PT0H45M22S");
                api.SetValue("cmi.completion_status", "completed");
                api.SetValue("cmi.success_status",    "passed");
                api.Commit("");
            } catch(e) {}

        } else { // 1.2
            const _origLMSSet = api.LMSSetValue;
            if (typeof _origLMSSet !== 'function') return;

            secureHook(api, 'LMSSetValue', function(element, value) {
                if (element.includes("score.raw"))    value = "100";
                if (element.includes("suspend_data")) value = sf();
                if (element.includes("objectives.") && element.includes("status")) value = "passed";
                if (element.includes("session_time"))  value = "00:45:22.00";
                if (element.includes("lesson_status")) value = "completed";
                return _origLMSSet.call(api, element, value);
            });

            try {
                api.LMSSetValue("cmi.core.score.raw",     "100");
                api.LMSSetValue("cmi.core.score.min",     "0");
                api.LMSSetValue("cmi.core.score.max",     "100");
                api.LMSSetValue("cmi.suspend_data",       sf());
                api.LMSSetValue("cmi.core.session_time",  "00:45:22.00");
                api.LMSSetValue("cmi.core.lesson_status", "completed");
                api.LMSCommit("");
            } catch(e) {}
        }

        try {
            Object.defineProperty(api, '__scormPassHooked', { value: true, writable: false, configurable: false });
        } catch(e) {
            api.__scormPassHooked = true;
        }

        console.log(`[+] SCORM ${version} hooks applied to API instance.`);
    }

    // =======================================================
    // LAYER 2C: API ASSIGNMENT INTERCEPTOR
    // Setter trap on window.API / window.API_1484_11 so any
    // reassignment during SPA navigation is re-hooked instantly.
    // =======================================================
    function interceptApiAssignment(winCtx, suspendFn) {
        [['API_1484_11', '2004'], ['API', '1.2']].forEach(([apiName, version]) => {
            try {
                let _val = winCtx[apiName];
                Object.defineProperty(winCtx, apiName, {
                    get()       { return _val; },
                    set(newVal) {
                        _val = newVal;
                        if (newVal) {
                            console.log(`[Watcher] ${apiName} reassigned — re-applying SCORM ${version} hooks.`);
                            applyScormHooksTo(version, newVal, suspendFn || (() => "completed"));
                        }
                    },
                    configurable: true
                });
                if (_val) applyScormHooksTo(version, _val, suspendFn || (() => "completed"));
            } catch(e) {}
        });
    }

    // =======================================================
    // LAYER 2D: IFRAME MUTATION OBSERVER
    // Watches for new iframes added by D2L SPA navigation and
    // installs the API assignment interceptor on each new window.
    // =======================================================
    function installIframeObserver(suspendFn) {
        if (!window.MutationObserver) return;

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (!node || node.nodeName !== 'IFRAME') return;
                    node.addEventListener('load', () => {
                        try {
                            const iWin = node.contentWindow;
                            if (!iWin) return;
                            interceptApiAssignment(iWin, suspendFn);
                        } catch(e) {}
                    });
                });
            });
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
        console.log("[+] L2D: Iframe SCORM re-hook observer installed.");
    }

    // =======================================================
    // LAYER 1: NETWORK DATA INTERCEPTORS (xAPI / cmi5 / REST / BEACON / BSI)
    // =======================================================
    function sanitizeElearningPayload(rawBody, requestUrl) {
        if (typeof rawBody !== 'string') return rawBody;

        const isBsiEndpoint = !!requestUrl && /\/d2l\/(api|bsi|lp)\//i.test(requestUrl);

        if (!isBsiEndpoint &&
            !rawBody.includes("verb")           && !rawBody.includes("result")       &&
            !rawBody.includes("score")          && !rawBody.includes("status")       &&
            !rawBody.includes("isCompleted")    && !rawBody.includes("omplet")       &&
            !rawBody.includes("CompletionType") && !rawBody.includes("ActivityType") &&
            !rawBody.includes("progress")) {
            return rawBody;
        }

        try {
            let data = JSON.parse(rawBody);

            const mutateStatement = (stmt) => {
                // xAPI nested result
                if (stmt.result) {
                    if (stmt.result.score) {
                        stmt.result.score.scaled = 1.0;
                        if (stmt.result.score.raw !== undefined) stmt.result.score.raw = 100;
                        if (stmt.result.score.max !== undefined) stmt.result.score.max = 100;
                    }
                    stmt.result.completion = true;
                    stmt.result.success    = true;
                    if (stmt.result.duration) stmt.result.duration = "PT45M22S";
                }

                // xAPI verb
                if (stmt.verb && stmt.verb.id && stmt.verb.id.includes("/failed")) {
                    stmt.verb.id = stmt.verb.id.replace("/failed", "/passed");
                    if (stmt.verb.display) {
                        Object.keys(stmt.verb.display).forEach(lang => {
                            if (stmt.verb.display[lang] === "failed") stmt.verb.display[lang] = "passed";
                        });
                    }
                }

                // D2L telemetry / BSI fields
                if (stmt.status           !== undefined) stmt.status           = "completed";
                if (stmt.isCompleted      !== undefined) stmt.isCompleted      = true;
                if (stmt.CompletionStatus !== undefined) stmt.CompletionStatus = "Completed";
                if (stmt.IsCompleted      !== undefined) stmt.IsCompleted      = true;
                if (stmt.ScoreNumerator   !== undefined && stmt.ScoreDenominator !== undefined) {
                    stmt.ScoreNumerator = stmt.ScoreDenominator;
                }
                if (stmt.CompletionType !== undefined) stmt.CompletionType = 2;
                if (stmt.IsExempt       !== undefined) stmt.IsExempt       = false;
                if (stmt.progress       !== undefined) stmt.progress       = 1.0;
            };

            if (Array.isArray(data)) data.forEach(item => mutateStatement(item));
            else mutateStatement(data);

            return JSON.stringify(data);
        } catch(e) {
            return rawBody;
        }
    }

    // Track XHR URL for BSI endpoint detection
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._interceptUrl = url ? String(url) : '';
        return originalOpen.apply(this, [method, url, ...args]);
    };

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        if (init && init.body) {
            const url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
            init.body = sanitizeElearningPayload(init.body, url);
        }
        return originalFetch.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        if (body) body = sanitizeElearningPayload(body, this._interceptUrl || '');
        return originalSend.apply(this, arguments);
    };

    if (navigator && navigator.sendBeacon) {
        const originalBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function(url, data) {
            if (data) data = sanitizeElearningPayload(data, url);
            return originalBeacon.apply(this, arguments);
        };
    }

    // Passive: intercept any future API assignment on the current window
    interceptApiAssignment(window, () => "completed");

    console.log("[+] Universal Elearning Network Interceptor Active (v4.1).");

    // =======================================================
    // LAYER 4A: postMessage CROSS-FRAME INTERCEPTOR
    // Sanitizes outbound SCORM iframe messages; logs inbound.
    // =======================================================
    (function installPostMessageHook() {
        const _postMessage = window.postMessage;

        window.postMessage = function(message, targetOrigin, transfer) {
            if (message && typeof message === 'object') {
                message = sanitizeD2LObject(Object.assign({}, message));
            } else if (typeof message === 'string') {
                try {
                    let parsed = JSON.parse(message);
                    parsed = sanitizeD2LObject(parsed);
                    message = JSON.stringify(parsed);
                } catch(e) {}
            }
            return _postMessage.call(window, message, targetOrigin, transfer);
        };

        window.addEventListener('message', function(event) {
            if (!event.data) return;
            try {
                const data    = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (!data || typeof data !== 'object') return;
                const typeStr = String(data.type || data.action || '').toLowerCase();
                if (/(complet|progress|sequence|scorm|score|pass|status)/.test(typeStr)) {
                    console.log("[L4A] Cross-frame postMessage intercepted:", typeStr);
                }
            } catch(e) {}
        }, true);

        console.log("[+] L4A: postMessage cross-frame interceptor installed.");
    })();

    // =======================================================
    // LAYER 4B: D2L LP NAMESPACE POLLER
    // Hooks D2L.LP.Web.UI.Rpc.Call (BSI) and MasterPage
    // callbacks which sit between D2L's shell and SCORM content.
    // =======================================================
    (function installD2LNamespaceHook() {
        function hookD2LNamespace() {
            ['D2L', 'D2LLP'].forEach(nsKey => {
                const ns = window[nsKey];
                if (!ns) return;

                try {
                    const rpc = (ns.LP && ns.LP.Web && ns.LP.Web.UI && ns.LP.Web.UI.Rpc) || ns.Rpc || null;
                    if (rpc && typeof rpc.Call === 'function') {
                        const _origCall = rpc.Call;
                        secureHook(rpc, 'Call', function(endpoint, params, ...rest) {
                            console.log(`[L4B] D2L RPC Call: ${endpoint}`);
                            if (params && typeof params === 'object') {
                                params = sanitizeD2LObject(Object.assign({}, params));
                            }
                            return _origCall.call(rpc, endpoint, params, ...rest);
                        });
                        console.log("[+] L4B: D2L LP RPC.Call hook installed.");
                    }
                } catch(e) {}

                try {
                    const desktop = ns.LP && ns.LP.Web && ns.LP.Web.UI && ns.LP.Web.UI.Desktop;
                    if (desktop && desktop.MasterPage && typeof desktop.MasterPage === 'object') {
                        const mp = desktop.MasterPage;
                        ['SetProgress', 'SetCompletion', 'TrackCompletion'].forEach(method => {
                            if (typeof mp[method] === 'function') {
                                const _orig = mp[method];
                                secureHook(mp, method, function(...args) {
                                    console.log(`[L4B] D2L MasterPage.${method} intercepted.`);
                                    if (args.length > 0) args[0] = 1.0;
                                    return _orig.apply(mp, args);
                                });
                            }
                        });
                        console.log("[+] L4B: D2L MasterPage hooks installed.");
                    }
                } catch(e) {}

                console.log(`[+] L4B: ${nsKey} namespace sweep complete.`);
            });
        }

        let attempts = 0;
        const poll = setInterval(() => {
            if (window.D2L || window.D2LLP || ++attempts > 100) {
                clearInterval(poll);
                if (window.D2L || window.D2LLP) hookD2LNamespace();
            }
        }, 100);

        console.log("[+] L4B: D2L namespace poller started.");
    })();

    // =======================================================
    // LAYER 2: MANUALLY TRIGGERED CONTEXT HOOKS
    // =======================================================
    function activateScormPass() {
        console.log("--- INJECTING OMNIPRESENT SCORM NETWORK PROXY HOOK ---");

        // A. Handle Udutu Framework In-Memory Engine Arrays
        const targetWin = [window, window.parent, window.top].find(w => {
            try { return w.gblScreens && Array.isArray(w.gblScreens); } catch(e) { return false; }
        });

        if (targetWin) {
            console.log("[+] Udutu Local Data Architecture verified. Synchronizing screen objects...");
            try {
                targetWin.gblScreens.forEach(screen => {
                    screen.visited   = true;
                    screen.completed = true;
                    if (screen.maxscore > 0) screen.score = screen.maxscore;
                });
                if (targetWin.gblCourse && targetWin.gblCourse.baseModule) {
                    if (typeof targetWin.setModuleCompleted       === 'function') targetWin.setModuleCompleted(targetWin.gblCourse.baseModule);
                    if (typeof targetWin.evaluateCourseCompletion === 'function') targetWin.evaluateCourseCompletion();
                }
                console.log("[+] Udutu engine arrays forced successfully.");
            } catch(udutuArrErr) {
                console.warn("Udutu local variable modification limit reached:", udutuArrErr);
            }
        }

        function buildUdutuSuspendString() {
            if (!targetWin || !targetWin.gblScreens) return "completed";
            return targetWin.gblScreens
                .map(s => s.maxscore > 0 ? `${s.id}:${s.maxscore}` : s.id)
                .join(",");
        }

        // B. D2L Sequence Viewer — signal SCORM content completion via JWT
        let d2lViewer = null;
        try {
            d2lViewer = [window, window.parent, window.top].map(w => {
                try { return w.document.querySelector('d2l-sequence-viewer'); } catch(e) { return null; }
            }).find(el => el !== null);
        } catch(e) {}

        if (d2lViewer) {
            console.log("[+] D2L Sequence Viewer found — signalling completion.");
            try {
                const sequenceUrl = d2lViewer.getAttribute('href');
                const jwtToken    = d2lViewer.getAttribute('token');
                if (sequenceUrl && jwtToken) {
                    originalFetch(sequenceUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${jwtToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            status: "completed", completion: true, isCompleted: true,
                            progress: 1.0, ScoreNumerator: 100, ScoreDenominator: 100
                        })
                    }).then(res => console.log("[+] D2L sequence POST status:", res.status))
                      .catch(err => console.warn("[-] D2L completion packet dropped:", err));
                }
            } catch(e) {
                console.warn("D2L sequence element trace limited:", e);
            }
        }

        // C. Locate SCORM API and apply persistent hooks
        const busContext = findLmsDataBus(window);

        if (!busContext || !busContext.target) {
            console.error("Critical Error: Core SCORM API data bus is unreachable from this context.");
            if (!d2lViewer) {
                alert("LMS data structures were not found. Ensure execution context maps the current course framework viewport.");
                return;
            }
        } else {
            console.log(`[+] Hooking SCORM ${busContext.version} API...`);
            applyScormHooksTo(busContext.version, busContext.target, buildUdutuSuspendString);

            // Update window-level interceptor with the real Udutu suspend function
            interceptApiAssignment(window, buildUdutuSuspendString);
            [window.parent, window.top].forEach(w => {
                try { if (w && w !== window) interceptApiAssignment(w, buildUdutuSuspendString); } catch(e) {}
            });
        }

        // D. Udutu final save
        if (targetWin && typeof targetWin.saveProgress === 'function') {
            try { targetWin.saveProgress(true); } catch(e) {}
        }

        // E. Install iframe observer for persistent navigation re-hooking
        installIframeObserver(buildUdutuSuspendString);

        console.log("%c[HOOK ACTIVE] SCORM & BSI pipeline modifications attached.", "color: green; font-weight: bold;");
        alert("SCORM Pass Activated! Pipeline hooks have successfully synchronized.");
    }

    // =======================================================
    // LAYER 3: INTERFACE DEPLOYMENT BINDINGS (MENU CONTROLLERS)
    // =======================================================
    if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') {
        GM.registerMenuCommand("⚡ Activate SCORM Pass", activateScormPass);
    }

    function createContextMenu() {
        const menu = document.createElement('div');
        menu.id = 'scorm-pass-context-menu';

        Object.assign(menu.style, {
            position: 'fixed',
            display: 'none',
            zIndex: '2147483647',
            backgroundColor: '#1e1e2e',
            color: '#cdd6f4',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '13px',
            minWidth: '150px',
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.4)',
            borderRadius: '6px',
            padding: '4px 0',
            border: '1px solid #45475a',
            cursor: 'pointer',
            userSelect: 'none'
        });

        const menuItem = document.createElement('div');
        menuItem.innerText = '⚡ SCORM Pass';
        Object.assign(menuItem.style, {
            padding: '8px 12px',
            transition: 'background 0.2s ease',
            fontWeight: '500'
        });

        menuItem.addEventListener('mouseover', () => { menuItem.style.backgroundColor = '#89b4fa'; });
        menuItem.addEventListener('mouseout',  () => { menuItem.style.backgroundColor = 'transparent'; });

        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.style.display = 'none';
            activateScormPass();
        });

        menu.appendChild(menuItem);
        document.body.appendChild(menu);

        window.addEventListener('contextmenu', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                menu.style.left = `${e.clientX}px`;
                menu.style.top  = `${e.clientY}px`;
                menu.style.display = 'block';
            }
        });

        window.addEventListener('click',   ()  => { menu.style.display = 'none'; });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.style.display = 'none'; });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createContextMenu);
    } else {
        createContextMenu();
    }
})();
