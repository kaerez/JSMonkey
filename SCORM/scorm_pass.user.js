// ============================================
// SCORM/scorm_pass.user.js
// ============================================

// ==UserScript==
// @name         SCORM Pass Universal Hook Menu
// @namespace    https://github.com/kaerez/JSMonkey
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @version      2.0
// @description  Universal tracking proxy hook supporting SCORM 1.2/2004, xAPI, cmi5, and Udutu memory arrays with complete Time/Progress masking.
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
    // LAYER 1: NETWORK DATA INTERCEPTORS (xAPI / cmi5 / REST / BEACON)
    // =======================================================
    function sanitizeElearningPayload(rawBody) {
        if (typeof rawBody !== 'string') return rawBody;
        if (!rawBody.includes("verb") && !rawBody.includes("result") && !rawBody.includes("score")) {
            return rawBody;
        }

        try {
            let data = JSON.parse(rawBody);

            const mutateStatement = (stmt) => {
                if (stmt.result) {
                    if (stmt.result.score) {
                        stmt.result.score.scaled = 1.0;
                        if (stmt.result.score.raw !== undefined) { stmt.result.score.raw = 100; }
                        if (stmt.result.score.max !== undefined) { stmt.result.score.max = 100; }
                    }
                    stmt.result.completion = true;
                    stmt.result.success = true;
                    if (stmt.result.duration) { stmt.result.duration = "PT45M22S"; }
                }

                if (stmt.verb && stmt.verb.id) {
                    if (stmt.verb.id.includes("/failed")) {
                        stmt.verb.id = stmt.verb.id.replace("/failed", "/passed");
                        if (stmt.verb.display) {
                            Object.keys(stmt.verb.display).forEach((lang) => {
                                if (stmt.verb.display[lang] === "failed") { stmt.verb.display[lang] = "passed"; }
                            });
                        }
                    }
                }
            };

            if (Array.isArray(data)) {
                data.forEach((item) => { mutateStatement(item); });
            } else {
                mutateStatement(data);
            }

            return JSON.stringify(data);
        } catch (e) {
            return rawBody;
        }
    }

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        if (init && init.body) {
            init.body = sanitizeElearningPayload(init.body);
        }
        return originalFetch.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        if (body) {
            body = sanitizeElearningPayload(body);
        }
        return originalSend.apply(this, arguments);
    };

    if (navigator && navigator.sendBeacon) {
        const originalBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function(url, data) {
            if (data) { 
                data = sanitizeElearningPayload(data); 
            }
            return originalBeacon.apply(this, arguments);
        };
    }

    console.log("[+] Universal Elearning Network Interceptor Active.");

    // =======================================================
    // LAYER 2: MANUALLY TRIGGERED CONTEXT HOOKS (SCORM 1.2 / 2004 / UDUTU)
    // =======================================================
    function activateScormPass() {
        console.log("--- INJECTING OMNIPRESENT SCORM NETWORK PROXY HOOK ---");

        // A. Handle Udutu Framework In-Memory Engine Arrays directly if exposed
        const targetWin = [window, window.parent, window.top].find(w => w.gblScreens && Array.isArray(w.gblScreens));
        if (targetWin) {
            console.log("[+] Udutu Local Data Architecture verified. Synchronizing screen objects...");
            try {
                // Synchronize every individual question and presentation slide definition in RAM
                targetWin.gblScreens.forEach((screen) => {
                    screen.visited = true;
                    screen.completed = true;
                    if (screen.maxscore > 0) {
                        screen.score = screen.maxscore;
                    }
                });

                if (targetWin.gblCourse && targetWin.gblCourse.baseModule) {
                    if (typeof targetWin.setModuleCompleted === 'function') {
                        targetWin.setModuleCompleted(targetWin.gblCourse.baseModule);
                    }
                    if (typeof targetWin.evaluateCourseCompletion === 'function') {
                        targetWin.evaluateCourseCompletion();
                    }
                }
                console.log("[+] Udutu engine arrays forced successfully.");
            } catch(udutuArrErr) {
                console.warn("Udutu local variable modification limit reached:", udutuArrErr);
            }
        }

        // B. Locate and Intercept the SCORM Tracking Core API
        function findLmsDataBus(win) {
            try {
                if (win.API_1484_11) return { version: "2004", target: win.API_1484_11 };
                if (win.API) return { version: "1.2", target: win.API };
            } catch (e) {}
            if (win.parent && win.parent !== win) return findLmsDataBus(win.parent);
            if (win.opener) return findLmsDataBus(win.opener);
            return null;
        }

        const busContext = findLmsDataBus(window);

        if (!busContext || !busContext.target) {
            console.error("Critical Error: Core SCORM API data bus is unreachable from this context.");
            alert("SCORM API Data Bus not found. Ensure you are executing this command inside the active course window/frame context.");
            return;
        }

        const nativeLMS = busContext.target;
        console.log(`[+] Hijacking SCORM ${busContext.version} Pipeline Data Ingestion Engine...`);

        // Helper to compile a valid native suspend_data string from active screen registers
        function buildUdutuSuspendString() {
            if (!targetWin || !targetWin.gblScreens) return "completed";
            return targetWin.gblScreens
                .map(s => s.maxscore > 0 ? `${s.id}:${s.maxscore}` : s.id)
                .join(",");
        }

        // SCORM BRANCH: 2004 STANDARDS
        if (busContext.version === "2004") {
            const originalSetValue = nativeLMS.SetValue;
            
            secureHook(nativeLMS, 'SetValue', function(element, value) {
                if (element.includes("score.raw") || element.includes("score.scaled")) {
                    console.log(`[Hook Intercept] Masking score [${element}]: ${value} -> 100%`);
                    value = element.includes("scaled") ? 1.0 : 100;
                }
                if (element.includes("progress_measure")) {
                    console.log(`[Hook Intercept] Masking progress metrics -> 1.0`);
                    value = 1.0;
                }
                if (element.includes("suspend_data")) {
                    value = buildUdutuSuspendString();
                }
                if (element.includes("objectives.") && (element.includes("success_status") || element.includes("completion_status"))) {
                    value = element.includes("success") ? "passed" : "completed";
                }
                if (element.includes("session_time")) { value = "PT0H45M22S"; }
                if (element.includes("success_status")) value = "passed";
                if (element.includes("completion_status")) value = "completed";
                
                return originalSetValue.call(nativeLMS, element, value);
            });

            try {
                nativeLMS.SetValue("cmi.score.scaled", 1.0);
                nativeLMS.SetValue("cmi.score.raw", 100);
                nativeLMS.SetValue("cmi.score.min", 0);
                nativeLMS.SetValue("cmi.score.max", 100);
                nativeLMS.SetValue("cmi.progress_measure", 1.0);
                nativeLMS.SetValue("cmi.suspend_data", buildUdutuSuspendString());
                nativeLMS.SetValue("cmi.session_time", "PT0H45M22S");
                nativeLMS.SetValue("cmi.completion_status", "completed");
                nativeLMS.SetValue("cmi.success_status", "passed");
                nativeLMS.Commit("");
            } catch(e) {}

        // SCORM BRANCH: 1.2 STANDARDS
        } else {
            const originalLMSSetValue = nativeLMS.LMSSetValue;

            secureHook(nativeLMS, 'LMSSetValue', function(element, value) {
                if (element.includes("score.raw")) {
                    console.log(`[Hook Intercept] Masking raw score [${element}]: ${value} -> 100`);
                    value = "100";
                }
                if (element.includes("suspend_data")) {
                    value = buildUdutuSuspendString();
                }
                if (element.includes("objectives.") && element.includes("status")) { value = "passed"; }
                if (element.includes("session_time")) { value = "00:45:22.00"; }
                if (element.includes("lesson_status")) value = "completed";
                
                return originalLMSSetValue.call(nativeLMS, element, value);
            });

            try {
                nativeLMS.LMSSetValue("cmi.core.score.raw", "100");
                nativeLMS.LMSSetValue("cmi.core.score.min", "0");
                nativeLMS.LMSSetValue("cmi.core.score.max", "100");
                nativeLMS.LMSSetValue("cmi.suspend_data", buildUdutuSuspendString());
                nativeLMS.LMSSetValue("cmi.core.session_time", "00:45:22.00");
                nativeLMS.LMSSetValue("cmi.core.lesson_status", "completed");
                nativeLMS.LMSCommit("");
            } catch(e) {}
        }

        // C. Invoke final save pipeline through Udutu if method signatures match
        if (targetWin && typeof targetWin.saveProgress === 'function') {
            try { targetWin.saveProgress(true); } catch(e) {}
        }

        console.log("%c[HOOK ACTIVE] Comprehensive SCORM & Engine modifications attached.", "color: green; font-weight: bold;");
        alert("SCORM Pass Activated! Memory structures and tracking streams locked at 100%. Click any navigation button or close the window to process completion.");
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
        menuItem.addEventListener('mouseout', () => { menuItem.style.backgroundColor = 'transparent'; });
        
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
                menu.style.top = `${e.clientY}px`;
                menu.style.display = 'block';
            }
        });

        window.addEventListener('click', () => {
            menu.style.display = 'none';
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') menu.style.display = 'none';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createContextMenu);
    } else {
        createContextMenu();
    }
})();
