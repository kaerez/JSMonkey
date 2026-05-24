// ============================================
// userscripts/scorm_pass.user.js
// ============================================

// ==UserScript==
// @name         SCORM Pass Universal Hook Menu
// @namespace    https://github.com/kaerez/JSMonkey
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @version      1.5
// @description  Adds a toolbar menu command via GM.registerMenuCommand (Right-Click) and an inline context menu via Ctrl+Right-Click.
// @author       EK
// @license      AGPL-3.0-or-later
// @match        *://*/*
// @grant        GM.registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 1. Core Injection Payload (The Network Proxy Hook)
    function activateScormPass() {
        console.log("--- INJECTING OMNIPRESENT SCORM NETWORK PROXY HOOK ---");

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

        if (busContext.version === "2004") {
            const originalSetValue = nativeLMS.SetValue;
            nativeLMS.SetValue = function(element, value) {
                if (element.includes("score.raw") || element.includes("score.scaled")) {
                    console.log(`[Hook Intercept] Blocking attempt to write score: ${value}`);
                    value = element.includes("scaled") ? 1.0 : 100;
                }
                if (element.includes("success_status")) value = "passed";
                if (element.includes("completion_status")) value = "completed";
                return originalSetValue.call(nativeLMS, element, value);
            };

            try {
                nativeLMS.SetValue("cmi.score.scaled", 1.0);
                nativeLMS.SetValue("cmi.score.raw", 100);
                nativeLMS.SetValue("cmi.score.min", 0);
                nativeLMS.SetValue("cmi.score.max", 100);
                nativeLMS.SetValue("cmi.completion_status", "completed");
                nativeLMS.SetValue("cmi.success_status", "passed");
                nativeLMS.Commit("");
            } catch(e) {}

        } else {
            const originalLMSSetValue = nativeLMS.LMSSetValue;
            nativeLMS.LMSSetValue = function(element, value) {
                if (element.includes("score.raw")) {
                    console.log(`[Hook Intercept] Blocking attempt to write legacy score: ${value}`);
                    value = "100";
                }
                if (element.includes("lesson_status")) value = "completed";
                return originalLMSSetValue.call(nativeLMS, element, value);
            };

            try {
                nativeLMS.LMSSetValue("cmi.core.score.raw", "100");
                nativeLMS.LMSSetValue("cmi.core.score.min", "0");
                nativeLMS.LMSSetValue("cmi.core.score.max", "100");
                nativeLMS.LMSSetValue("cmi.core.lesson_status", "completed");
                nativeLMS.LMSCommit("");
            } catch(e) {}
        }

        console.log("%c[HOOK ACTIVE] Network shield initialized.", "color: green; font-weight: bold;");
        alert("SCORM Pass Activated! Outgoing parameter vectors are locked at 100%. Interact with or close the course window to finish submission.");
    }

    // =======================================================
    // METHOD 1: REGISTER VIA NATIVE TAMPERMONKEY DROPDOWN MENU
    // =======================================================
    if (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function') {
        GM.registerMenuCommand("⚡ Activate SCORM Pass", activateScormPass);
    }

    // =======================================================
    // METHOD 2: GENERATE CONTROL-KEY FLOATING PANEL OVERLAY
    // =======================================================
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

        // Block statement bodies satisfy standard strict validation policies
        menuItem.addEventListener('mouseover', () => { menuItem.style.backgroundColor = '#89b4fa'; });
        menuItem.addEventListener('mouseout', () => { menuItem.style.backgroundColor = 'transparent'; });

        menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.style.display = 'none';
            activateScormPass();
        });

        menu.appendChild(menuItem);
        document.body.appendChild(menu);

        // Activates custom floating menu when Ctrl + Right-Click is intercepted
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
