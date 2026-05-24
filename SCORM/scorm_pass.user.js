// ============================================
// SCORM/scorm_pass.user.js
// ============================================

// ==UserScript==
// @name         SCORM Pass Universal Hook Menu
// @namespace    https://github.com/kaerez/JSMonkey
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/SCORM/scorm_pass.user.js
// @version      5.1
// @description  Universal eLearning pass hook: SCORM 1.2/2004, xAPI, cmi5, AICC, Udutu, BSI, Articulate, Captivate, Lectora, Moodle, Canvas, H5P, D2L, Teachable, Cybrary, EC-Council (iClass/CodeRed). Persistent re-hooking, HTML5 video completion.
// @author       EK
// @license      AGPL-3.0-or-later
// @match        *://*/*
// @grant        GM.registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // =======================================================
    // UTILITY: DEFENSIVE PROPERTY HOOK
    // =======================================================
    const secureHook = (obj, methodName, proxyFunc) => {
        try {
            Object.defineProperty(obj, methodName, {
                value: proxyFunc,
                writable: false,
                configurable: true
            });
        } catch(e) {
            obj[methodName] = proxyFunc;
        }
    };

    // Mark an object as hooked (idempotency guard)
    function markHooked(obj) {
        try {
            Object.defineProperty(obj, '__scormPassHooked', { value: true, writable: false, configurable: false });
        } catch(e) {
            obj.__scormPassHooked = true;
        }
    }

    // =======================================================
    // SHARED HELPER: D2L / BSI / xAPI OBJECT SANITIZER
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
        if (obj.CompletionType !== undefined) obj.CompletionType = 2; // BSI: Automatic/Complete
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
    // SCORM CORE: API LOCATOR
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
    // SCORM CORE: HOOK APPLICATION — IDEMPOTENT
    // =======================================================
    function applyScormHooksTo(version, api, suspendFn) {
        if (!api || api.__scormPassHooked) return;
        const sf = (typeof suspendFn === 'function') ? suspendFn : (() => "completed");

        if (version === "2004") {
            const _origSet = api.SetValue;
            if (typeof _origSet !== 'function') return;
            secureHook(api, 'SetValue', function(element, value) {
                if (element.includes("score.raw") || element.includes("score.scaled"))
                    value = element.includes("scaled") ? 1.0 : 100;
                if (element.includes("progress_measure"))    value = 1.0;
                if (element.includes("suspend_data"))         value = sf();
                if (element.includes("objectives.") && (element.includes("success_status") || element.includes("completion_status")))
                    value = element.includes("success") ? "passed" : "completed";
                if (element.includes("session_time"))        value = "PT0H45M22S";
                if (element.includes("success_status"))      value = "passed";
                if (element.includes("completion_status"))   value = "completed";
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
                if (element.includes("lesson_status")) value = "passed";
                return _origLMSSet.call(api, element, value);
            });
            try {
                api.LMSSetValue("cmi.core.score.raw",     "100");
                api.LMSSetValue("cmi.core.score.min",     "0");
                api.LMSSetValue("cmi.core.score.max",     "100");
                api.LMSSetValue("cmi.suspend_data",       sf());
                api.LMSSetValue("cmi.core.session_time",  "00:45:22.00");
                api.LMSSetValue("cmi.core.lesson_status", "passed");
                api.LMSCommit("");
            } catch(e) {}
        }

        markHooked(api);
        console.log(`[+] SCORM ${version} hooks applied to API instance.`);
    }

    // =======================================================
    // SCORM CORE: API ASSIGNMENT SETTER TRAP
    // Re-hooks any future reassignment of window.API / window.API_1484_11
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
    // SCORM CORE: IFRAME MUTATION OBSERVER
    // =======================================================
    function installIframeObserver(suspendFn) {
        if (!window.MutationObserver) return;
        // Guard: only one observer ever installed per page load. suspendFn is captured from first activation.
        if (window.__scormPassIframeObserverActive) return;
        window.__scormPassIframeObserverActive = true;
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (!node || node.nodeName !== 'IFRAME') return;
                    node.addEventListener('load', () => {
                        try {
                            const iWin = node.contentWindow;
                            if (iWin) interceptApiAssignment(iWin, suspendFn);
                        } catch(e) {}
                    });
                });
            });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        console.log("[+] Iframe SCORM re-hook observer installed.");
    }

    // =======================================================
    // AICC: DETECT CMI URL FROM LAUNCH PARAMETERS
    // =======================================================
    const aiccCmiUrl = (() => {
        try {
            const p = new URLSearchParams(window.location.search);
            return (p.get('aicc_url') || p.get('AICC_URL') || '').toLowerCase() || null;
        } catch(e) { return null; }
    })();

    // AICC: MUTATE HACP PutParam PAYLOAD (form-encoded INI body)
    function sanitizeAICCPayload(body) {
        if (typeof body !== 'string') return body;
        if (!/command\s*=/i.test(body) || !/aicc_data\s*=/i.test(body)) return body;
        try {
            const params  = new URLSearchParams(body);
            const command = (params.get('command') || '').trim().toLowerCase();
            if (command !== 'putparam') return body;

            let aiccData = params.get('aicc_data') || '';

            // Mutate INI key-value pairs (case-insensitive)
            aiccData = aiccData.replace(/\blesson_status\s*=\s*\S+/gi,  'lesson_status=passed');
            aiccData = aiccData.replace(/\bc_status\s*=\s*\S+/gi,       'c_status=passed');
            aiccData = aiccData.replace(/\bscore\s*=\s*[\d.]+/gi,       'score=100');
            aiccData = aiccData.replace(/\btime\s*=\s*[\d:]+/gi,        'time=00:45:22');

            // Inject [Core] block if entirely absent
            if (!/\[core\]/i.test(aiccData)) {
                aiccData += '\r\n[Core]\r\nlesson_status=passed\r\nscore=100\r\ntime=00:45:22\r\n';
            }

            params.set('aicc_data', aiccData);
            console.log("[L1-AICC] PutParam payload sanitized.");
            return params.toString();
        } catch(e) { return body; }
    }

    // =======================================================
    // ARTICULATE STORYLINE / RISE: PLAYER HOOK
    // =======================================================
    function isArticulatePlayer(obj) {
        if (!obj || typeof obj !== 'object') return false;
        return typeof obj.SetVar       === 'function' ||
               typeof obj.reportStatus === 'function' ||
               typeof obj.reportScore  === 'function';
    }

    function hookArticulatePlayer(player) {
        if (!player || player.__scormPassHooked || !isArticulatePlayer(player)) return;

        if (typeof player.SetVar === 'function') {
            const _orig = player.SetVar;
            player.SetVar = function(varName, value) {
                const lv = String(varName).toLowerCase();
                if (lv.includes('score')) {
                    if (typeof value === 'number') value = 100;
                    if (typeof value === 'string' && /^\d/.test(value)) value = '100';
                }
                if (lv === 'completion_status' || lv.includes('completionstatus')) {
                    if (['incomplete', 'failed', 'not attempted'].includes(String(value).toLowerCase()))
                        value = 'complete';
                }
                if (lv === 'success_status' || lv.includes('successstatus')) {
                    if (String(value).toLowerCase() === 'failed') value = 'passed';
                }
                return _orig.call(player, varName, value);
            };
        }

        if (typeof player.reportStatus === 'function') {
            const _orig = player.reportStatus;
            player.reportStatus = function() { return _orig.call(player, 'complete'); };
        }

        if (typeof player.reportScore === 'function') {
            const _orig = player.reportScore;
            player.reportScore = function(score, maxScore) {
                const max = maxScore || 100;
                return _orig.call(player, max, max);
            };
        }

        markHooked(player);
        console.log("[+] Articulate Storyline player hooks applied.");
    }

    function activateArticulate(player) {
        hookArticulatePlayer(player);
        if (!player) return;
        try { player.reportStatus('complete'); }   catch(e) {}
        try { player.reportScore(100, 100); }      catch(e) {}
        try {
            player.SetVar("completion_status", "complete");
            player.SetVar("success_status",    "passed");
            player.SetVar("score.raw",         100);
            player.SetVar("score.scaled",      1);
        } catch(e) {}
    }

    // =======================================================
    // ADOBE CAPTIVATE: cpAPIInterface HOOK
    // =======================================================
    function hookCaptivateAPI(cpAPI) {
        if (!cpAPI || cpAPI.__scormPassHooked) return;
        if (typeof cpAPI.setVariableValue !== 'function') return;

        const _orig = cpAPI.setVariableValue;
        cpAPI.setVariableValue = function(varName, value) {
            if (varName === 'cpQuizInfoPassFail')     { value = 1; }
            if (varName === 'cpQuizInfoPointsscored') {
                try { value = cpAPI.getVariableValue('cpQuizInfoTotalQuizPoints') || value; } catch(e) {}
            }
            return _orig.call(cpAPI, varName, value);
        };

        markHooked(cpAPI);
        console.log("[+] Captivate cpAPIInterface hooks applied.");
    }

    function activateCaptivate(cpAPI) {
        hookCaptivateAPI(cpAPI);
        if (!cpAPI) return;
        try {
            const total = cpAPI.getVariableValue('cpQuizInfoTotalQuizPoints') || 100;
            cpAPI.setVariableValue('cpQuizInfoPassFail',      1);
            cpAPI.setVariableValue('cpQuizInfoPointsscored',  total);
        } catch(e) {}
    }

    // =======================================================
    // CANVAS LMS: FIRE MODULE ITEM COMPLETION
    // Student-callable: marks must_mark_done items as done.
    // =======================================================
    function fireCanvasCompletion() {
        if (!window.ENV) return;
        const env          = window.ENV;
        const courseId     = env.COURSE_ID     || env.course_id;
        const moduleItemId = env.MODULE_ITEM_ID || env.module_item_id;
        if (!courseId || !moduleItemId) return;

        const csrfToken = (() => {
            try {
                // Canvas stores CSRF in meta tag (primary) or _csrf_token cookie (fallback)
                const meta = document.querySelector('meta[name="csrf-token"]');
                if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
                const m = document.cookie.match(/_csrf_token=([^;]+)/);
                return m ? decodeURIComponent(m[1]) : '';
            } catch(e) { return ''; }
        })();

        console.log(`[Canvas] Firing completion for course=${courseId}, item=${moduleItemId}`);
        originalFetch(`/api/v1/courses/${courseId}/modules/items/${moduleItemId}/done`, {
            method: 'PUT',
            headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
            credentials: 'include'
        }).then(res => console.log(`[Canvas] Module item done: ${res.status}`))
          .catch(err => console.warn("[Canvas] Module item done failed:", err));
    }

    // =======================================================
    // LAYER 1: NETWORK DATA INTERCEPTORS
    // xAPI / cmi5 / REST / BEACON / BSI / AICC / Moodle
    // =======================================================
    function sanitizeElearningPayload(rawBody, requestUrl) {
        if (typeof rawBody !== 'string') return rawBody;

        const isBsiEndpoint = !!requestUrl && /\/d2l\/(api|bsi|lp)\//i.test(requestUrl);

        if (!isBsiEndpoint &&
            !rawBody.includes("verb")           && !rawBody.includes("result")         &&
            !rawBody.includes("score")          && !rawBody.includes("status")         &&
            !rawBody.includes("isCompleted")    && !rawBody.includes("omplet")         &&
            !rawBody.includes("CompletionType") && !rawBody.includes("ActivityType")   &&
            !rawBody.includes("completionstate")&& !rawBody.includes("progress")    &&
            !rawBody.includes("watch_p")           && !rawBody.includes("percent_c")   &&
            !rawBody.includes("currentTime")) {
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

                // D2L / BSI telemetry fields
                if (stmt.status           !== undefined) stmt.status           = "completed";
                if (stmt.isCompleted      !== undefined) stmt.isCompleted      = true;
                if (stmt.CompletionStatus !== undefined) stmt.CompletionStatus = "Completed";
                if (stmt.IsCompleted      !== undefined) stmt.IsCompleted      = true;
                if (stmt.ScoreNumerator   !== undefined && stmt.ScoreDenominator !== undefined)
                    stmt.ScoreNumerator = stmt.ScoreDenominator;
                if (stmt.CompletionType   !== undefined) stmt.CompletionType   = 2;
                if (stmt.IsExempt         !== undefined) stmt.IsExempt         = false;
                if (stmt.progress         !== undefined) stmt.progress         = 1.0;

                // Moodle AJAX format: {"methodname": "...", "args": {"cmid": x, "completed": false}}
                if (stmt.args && typeof stmt.args === 'object') {
                    if (stmt.args.completed       !== undefined) stmt.args.completed       = true;
                    if (stmt.args.completionstate !== undefined) stmt.args.completionstate = 1;
                }

                // Video progress fields (Teachable, Cybrary, CodeRed, generic)
                if (stmt.watch_percent    !== undefined) stmt.watch_percent    = 100;
                if (stmt.percent_watched  !== undefined) stmt.percent_watched  = 100;
                if (stmt.percent_complete !== undefined) stmt.percent_complete = 100;
                if (stmt.position !== undefined && stmt.duration !== undefined) stmt.position = stmt.duration;
                if (stmt.currentTime !== undefined && stmt.duration !== undefined) stmt.currentTime = stmt.duration;
            };

            if (Array.isArray(data)) data.forEach(item => mutateStatement(item));
            else mutateStatement(data);

            return JSON.stringify(data);
        } catch(e) {
            return rawBody;
        }
    }

    // Track XHR URL and AICC endpoint match
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._interceptUrl = url ? String(url) : '';
        this._isAICC = !!(aiccCmiUrl && this._interceptUrl.toLowerCase() === aiccCmiUrl);
        return originalOpen.apply(this, [method, url, ...args]);
    };

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
        if (init && init.body) {
            init.body = sanitizeElearningPayload(init.body, url);
            if (aiccCmiUrl && url.toLowerCase() === aiccCmiUrl)
                init.body = sanitizeAICCPayload(init.body);
        }
        return originalFetch.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
        if (body) {
            body = sanitizeElearningPayload(body, this._interceptUrl || '');
            if (this._isAICC) body = sanitizeAICCPayload(body);
        }
        return originalSend.apply(this, arguments);
    };

    if (navigator && navigator.sendBeacon) {
        const originalBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function(url, data) {
            if (data) data = sanitizeElearningPayload(data, url);
            return originalBeacon.apply(this, arguments);
        };
    }

    // Passive: intercept future API assignments on the current window
    interceptApiAssignment(window, () => "completed");

    console.log("[+] Universal eLearning Network Interceptor Active (v5.1).");

    // =======================================================
    // LAYER 4A: postMessage CROSS-FRAME INTERCEPTOR
    // =======================================================
    (function installPostMessageHook() {
        const _pm = window.postMessage;
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
            return _pm.call(window, message, targetOrigin, transfer);
        };
        window.addEventListener('message', function(event) {
            if (!event.data) return;
            try {
                const data    = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (!data || typeof data !== 'object') return;
                const typeStr = String(data.type || data.action || '').toLowerCase();
                if (/(complet|progress|sequence|scorm|score|pass|status)/.test(typeStr))
                    console.log("[L4A] Cross-frame postMessage intercepted:", typeStr);
            } catch(e) {}
        }, true);
        console.log("[+] L4A: postMessage cross-frame interceptor installed.");
    })();

    // =======================================================
    // LAYER 4B: D2L LP NAMESPACE POLLER
    // Hooks RPC.Call (BSI) + MasterPage (SCORM delivery layer)
    // =======================================================
    (function installD2LNamespaceHook() {
        function hookD2LNamespace() {
            ['D2L', 'D2LLP'].forEach(nsKey => {
                const ns = window[nsKey];
                if (!ns) return;
                try {
                    const rpc = (ns.LP && ns.LP.Web && ns.LP.Web.UI && ns.LP.Web.UI.Rpc) || ns.Rpc || null;
                    if (rpc && typeof rpc.Call === 'function' && !rpc.__scormPassHooked) {
                        const _origCall = rpc.Call;
                        secureHook(rpc, 'Call', function(endpoint, params, ...rest) {
                            console.log(`[L4B] D2L RPC: ${endpoint}`);
                            if (params && typeof params === 'object')
                                params = sanitizeD2LObject(Object.assign({}, params));
                            return _origCall.call(rpc, endpoint, params, ...rest);
                        });
                        markHooked(rpc);
                        console.log("[+] L4B: D2L LP RPC.Call hook installed.");
                    }
                } catch(e) {}
                try {
                    const desktop = ns.LP && ns.LP.Web && ns.LP.Web.UI && ns.LP.Web.UI.Desktop;
                    if (desktop && desktop.MasterPage && !desktop.MasterPage.__scormPassHooked) {
                        const mp = desktop.MasterPage;
                        ['SetProgress', 'SetCompletion', 'TrackCompletion'].forEach(method => {
                            if (typeof mp[method] === 'function') {
                                const _orig = mp[method];
                                secureHook(mp, method, function(...args) {
                                    if (args.length > 0) args[0] = 1.0;
                                    return _orig.apply(mp, args);
                                });
                            }
                        });
                        markHooked(desktop.MasterPage);
                        console.log("[+] L4B: D2L MasterPage hooks installed.");
                    }
                } catch(e) {}
                console.log(`[+] L4B: ${nsKey} namespace sweep complete.`);
            });
        }
        let a = 0;
        const p = setInterval(() => { if (window.D2L || window.D2LLP || ++a > 100) { clearInterval(p); if (window.D2L || window.D2LLP) hookD2LNamespace(); } }, 100);
        console.log("[+] L4B: D2L namespace poller started.");
    })();

    // =======================================================
    // LAYER 5A: ARTICULATE STORYLINE / RISE — PASSIVE POLLER
    // Watches window.player and window.GetPlayer for assignment
    // =======================================================
    (function installArticulateHook() {
        // Trap GetPlayer assignment
        try {
            let _GetPlayer = window.GetPlayer;
            Object.defineProperty(window, 'GetPlayer', {
                get() { return _GetPlayer; },
                set(fn) {
                    _GetPlayer = fn;
                    setTimeout(() => { try { const p = fn(); if (p) hookArticulatePlayer(p); } catch(e) {} }, 300);
                },
                configurable: true
            });
            if (typeof _GetPlayer === 'function') {
                setTimeout(() => { try { const p = _GetPlayer(); if (p) hookArticulatePlayer(p); } catch(e) {} }, 300);
            }
        } catch(e) {}

        // Poll for window.player
        let a = 0;
        const poll = setInterval(() => {
            const player = window.player || (typeof window.GetPlayer === 'function' ? (() => { try { return window.GetPlayer(); } catch(e) { return null; } })() : null);
            if ((player && isArticulatePlayer(player)) || ++a > 100) {
                clearInterval(poll);
                if (player && isArticulatePlayer(player)) hookArticulatePlayer(player);
            }
        }, 100);
        console.log("[+] L5A: Articulate player poller started.");
    })();

    // =======================================================
    // LAYER 5B: ADOBE CAPTIVATE — PASSIVE POLLER
    // Watches window.cpAPIInterface for assignment
    // =======================================================
    (function installCaptivateHook() {
        try {
            let _cpAPI = window.cpAPIInterface;
            Object.defineProperty(window, 'cpAPIInterface', {
                get() { return _cpAPI; },
                set(v) { _cpAPI = v; if (v) hookCaptivateAPI(v); },
                configurable: true
            });
            if (_cpAPI) hookCaptivateAPI(_cpAPI);
        } catch(e) {}

        let a = 0;
        const poll = setInterval(() => {
            if (window.cpAPIInterface || ++a > 100) {
                clearInterval(poll);
                if (window.cpAPIInterface) hookCaptivateAPI(window.cpAPIInterface);
            }
        }, 100);
        console.log("[+] L5B: Captivate API poller started.");
    })();

    // =======================================================
    // LAYER 5C: MOODLE — PASSIVE HOOKS
    // Hooks M.core_completion, Y.io (YUI), and jQuery.ajaxPrefilter
    // =======================================================
    (function installMoodleHooks() {
        function applyMoodleHooks() {
            if (!window.M || !window.M.cfg) return false;

            // M.core_completion.init — override item states before init
            try {
                if (window.M.core_completion && typeof window.M.core_completion.init === 'function'
                    && !window.M.core_completion.__scormPassHooked) {
                    const _origInit = window.M.core_completion.init;
                    window.M.core_completion.init = function(Y, overrideinfo) {
                        if (Array.isArray(overrideinfo))
                            overrideinfo.forEach(item => { if (item) item.state = 1; });
                        return _origInit.call(window.M.core_completion, Y, overrideinfo);
                    };
                    markHooked(window.M.core_completion);
                    console.log("[+] L5C: Moodle M.core_completion.init hooked.");
                }
            } catch(e) {}

            // YUI Y.io — used for Moodle AJAX before jQuery era
            try {
                if (window.Y && window.Y.io && !window.Y.io.__scormPassHooked) {
                    const _origYio = window.Y.io;
                    window.Y.io = function(url, config) {
                        if (config && config.data && typeof config.data === 'string')
                            config.data = sanitizeElearningPayload(config.data, url);
                        return _origYio.apply(this, arguments);
                    };
                    window.Y.io.__scormPassHooked = true;
                    console.log("[+] L5C: Moodle Y.io hook installed.");
                }
            } catch(e) {}

            return true;
        }

        function installJQueryHook() {
            const jq = window.jQuery || window.$;
            if (!jq || typeof jq.ajaxPrefilter !== 'function') return false;
            if (jq.__scormPassAjaxHooked) return true;
            try {
                jq.ajaxPrefilter(function(options) {
                    if (options.data && typeof options.data === 'string')
                        options.data = sanitizeElearningPayload(options.data, options.url || '');
                });
                jq.__scormPassAjaxHooked = true;
                console.log("[+] L5C: jQuery ajaxPrefilter hook installed.");
                return true;
            } catch(e) { return false; }
        }

        let mA = 0, jqA = 0;
        const mPoll  = setInterval(() => { if (applyMoodleHooks()   || ++mA  > 100) clearInterval(mPoll);  }, 100);
        const jqPoll = setInterval(() => { if (installJQueryHook() || ++jqA > 100) clearInterval(jqPoll); }, 100);
        console.log("[+] L5C: Moodle/jQuery hook pollers started.");
    })();

    // =======================================================
    // LAYER 5D: H5P — externalDispatcher HOOK
    // Mutates xAPI statements before they are dispatched
    // =======================================================
    (function installH5PHook() {
        function applyH5PHooks() {
            if (!window.H5P) return false;
            const dispatcher = window.H5P.externalDispatcher;
            if (!dispatcher || typeof dispatcher.trigger !== 'function') return false;
            if (dispatcher.__scormPassHooked) return true;

            const _origTrigger = dispatcher.trigger.bind(dispatcher);
            dispatcher.trigger = function(event, ...args) {
                if (event === 'xAPI') {
                    try {
                        const stmt = args[0] && args[0].data && args[0].data.statement;
                        if (stmt) {
                            if (stmt.result) {
                                stmt.result.completion = true;
                                stmt.result.success    = true;
                                if (stmt.result.score) {
                                    if (stmt.result.score.scaled !== undefined) stmt.result.score.scaled = 1.0;
                                    if (stmt.result.score.raw    !== undefined) stmt.result.score.raw    = stmt.result.score.max || 100;
                                }
                                if (stmt.result.duration) stmt.result.duration = "PT45M22S";
                            }
                            if (stmt.verb && stmt.verb.id && stmt.verb.id.includes('/failed'))
                                stmt.verb.id = stmt.verb.id.replace('/failed', '/passed');
                        }
                    } catch(e) {}
                }
                return _origTrigger(event, ...args);
            };

            markHooked(dispatcher);
            console.log("[+] L5D: H5P externalDispatcher hook applied.");
            return true;
        }

        let a = 0;
        const poll = setInterval(() => { if (applyH5PHooks() || ++a > 100) clearInterval(poll); }, 100);
        console.log("[+] L5D: H5P dispatcher poller started.");
    })();


    // =======================================================
    // LAYER 5E: LECTORA — GLOBAL VARIABLE TRAPS
    // Lectora content reads AICC_Lesson_Status / AICC_Score /
    // CMI_Completion_Status from window before reporting to LMS.
    // Setter traps force these to always return passing values.
    // Installed passively at document-start; harmless on non-Lectora pages.
    // =======================================================
    (function installLectoraHook() {
        const LECTORA_VARS = {
            'AICC_Lesson_Status':         'passed',
            'AICC_Student_Lesson_Status': 'passed',
            'AICC_Score':                 100,
            'CMI_Completion_Status':      'completed',
            'CMI_Success_Status':         'passed'
        };

        Object.entries(LECTORA_VARS).forEach(([varName, forcedVal]) => {
            try {
                let _stored = window[varName];
                Object.defineProperty(window, varName, {
                    get()    { return forcedVal; },
                    set(v)   { _stored = v; }, // capture but getter always wins
                    configurable: true,
                    enumerable:   true
                });
            } catch(e) {
                window[varName] = forcedVal; // fallback direct assign
            }
        });

        console.log("[+] L5E: Lectora variable traps installed.");
    })();

    // =======================================================
    // LAYER 6A: HTML5 VIDEO COMPLETION
    // Forces video elements to appear 100% watched by overriding
    // currentTime = duration on each element and dispatching
    // timeupdate / progress / ended events.
    // NOT passive — only activated on user trigger to avoid
    // breaking video on non-learning sites (YouTube, etc.).
    // Covers: Teachable, Cybrary, EC-Council CodeRed, any HTML5 video LMS.
    // =======================================================
    function forceVideoComplete(video) {
        if (!video || video.__scormPassVideoHooked) return;
        video.__scormPassVideoHooked = true;

        function doForce() {
            const dur = video.duration;
            if (!dur || !isFinite(dur) || dur <= 0) return;

            // Override currentTime to always report duration (= 100% watched)
            try {
                Object.defineProperty(video, 'currentTime', {
                    get()  { return dur; },
                    set()  {}, // no-op: prevents platform from rewinding
                    configurable: true
                });
            } catch(e) {
                try { video.currentTime = dur; } catch(e2) {}
            }

            // Dispatch standard HTML5 media events in order
            ['timeupdate', 'progress', 'ended'].forEach(evtName => {
                try {
                    video.dispatchEvent(new Event(evtName, { bubbles: true }));
                } catch(e) {}
            });

            console.log("[L6A] Video forced to 100% complete.");
        }

        // Force immediately if metadata already loaded, else wait
        if (video.readyState >= 1 && isFinite(video.duration) && video.duration > 0) {
            doForce();
        } else {
            video.addEventListener('loadedmetadata', doForce, { once: true });
        }
    }

    function installVideoCompletionHook() {
        if (window.__scormPassVideoHookActive) return;
        window.__scormPassVideoHookActive = true;

        // Force all currently loaded videos
        try {
            document.querySelectorAll('video').forEach(forceVideoComplete);
        } catch(e) {}

        // Watch for videos added after activation (SPA navigation, lazy loading)
        if (!window.MutationObserver) return;
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (!node) return;
                    if (node.nodeName === 'VIDEO') {
                        forceVideoComplete(node);
                    } else if (typeof node.querySelectorAll === 'function') {
                        node.querySelectorAll('video').forEach(forceVideoComplete);
                    }
                });
            });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        console.log("[+] L6A: Video completion hook active.");
    }

    // =======================================================
    // LAYER 2: MANUALLY TRIGGERED CONTEXT HOOKS
    // =======================================================
    function activateScormPass() {
        console.log("--- INJECTING OMNIPRESENT SCORM NETWORK PROXY HOOK ---");

        // A. Udutu Framework In-Memory Engine Arrays
        const targetWin = [window, window.parent, window.top].find(w => {
            try { return w.gblScreens && Array.isArray(w.gblScreens); } catch(e) { return false; }
        });
        if (targetWin) {
            console.log("[+] Udutu Local Data Architecture verified.");
            try {
                targetWin.gblScreens.forEach(screen => {
                    screen.visited = screen.completed = true;
                    if (screen.maxscore > 0) screen.score = screen.maxscore;
                });
                if (targetWin.gblCourse && targetWin.gblCourse.baseModule) {
                    if (typeof targetWin.setModuleCompleted       === 'function') targetWin.setModuleCompleted(targetWin.gblCourse.baseModule);
                    if (typeof targetWin.evaluateCourseCompletion === 'function') targetWin.evaluateCourseCompletion();
                }
                console.log("[+] Udutu engine arrays forced.");
            } catch(e) { console.warn("Udutu modification limit:", e); }
        }

        function buildUdutuSuspendString() {
            if (!targetWin || !targetWin.gblScreens) return "completed";
            return targetWin.gblScreens.map(s => s.maxscore > 0 ? `${s.id}:${s.maxscore}` : s.id).join(",");
        }

        // B. D2L Sequence Viewer — SCORM content completion via JWT
        let d2lViewer = null;
        try {
            d2lViewer = [window, window.parent, window.top]
                .map(w => { try { return w.document.querySelector('d2l-sequence-viewer'); } catch(e) { return null; } })
                .find(el => el !== null);
        } catch(e) {}
        if (d2lViewer) {
            try {
                const sequenceUrl = d2lViewer.getAttribute('href');
                const jwtToken    = d2lViewer.getAttribute('token');
                if (sequenceUrl && jwtToken) {
                    originalFetch(sequenceUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${jwtToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: "completed", completion: true, isCompleted: true, progress: 1.0, ScoreNumerator: 100, ScoreDenominator: 100 })
                    }).then(res => console.log("[+] D2L sequence POST:", res.status))
                      .catch(err => console.warn("[-] D2L completion packet dropped:", err));
                }
            } catch(e) { console.warn("D2L sequence element trace limited:", e); }
        }

        // C. SCORM API hooks + persistent assignment interceptors
        const busContext = findLmsDataBus(window);
        if (!busContext || !busContext.target) {
            console.error("Core SCORM API data bus unreachable.");
            // Only bail out if no other supported framework is detectable on this page.
            // AICC, video-based platforms (Teachable/Cybrary/CodeRed), Articulate, and
            // Captivate all lack a SCORM API but are handled by later sections.
            const hasVideoContent = document.querySelectorAll('video').length > 0;
            const hasArticulate   = !!(window.player || typeof window.GetPlayer === 'function');
            const hasCaptivate    = !!window.cpAPIInterface;
            if (!d2lViewer && !aiccCmiUrl && !hasVideoContent && !hasArticulate && !hasCaptivate) {
                alert("LMS data structures were not found. Ensure execution context maps the current course framework viewport.");
                return;
            }
        } else {
            const api = busContext.target;
            console.log(`[+] Hooking SCORM ${busContext.version} API...`);

            // Apply hooks (idempotent via __scormPassHooked guard)
            applyScormHooksTo(busContext.version, api, buildUdutuSuspendString);

            // BUG FIX: Force-set values directly every activation, bypassing the
            // idempotency guard. The passive watcher may have already hooked the API
            // (preventing applyScormHooksTo from running its force-set block), so we
            // call the API directly here to guarantee immediate 100% values on activation.
            if (busContext.version === "2004") {
                try {
                    api.SetValue("cmi.score.scaled",      1.0);
                    api.SetValue("cmi.score.raw",         100);
                    api.SetValue("cmi.score.min",         0);
                    api.SetValue("cmi.score.max",         100);
                    api.SetValue("cmi.progress_measure",  1.0);
                    api.SetValue("cmi.suspend_data",      buildUdutuSuspendString());
                    api.SetValue("cmi.session_time",      "PT0H45M22S");
                    api.SetValue("cmi.completion_status", "completed");
                    api.SetValue("cmi.success_status",    "passed");
                    api.Commit("");
                } catch(e) {}
            } else {
                try {
                    api.LMSSetValue("cmi.core.score.raw",     "100");
                    api.LMSSetValue("cmi.core.score.min",     "0");
                    api.LMSSetValue("cmi.core.score.max",     "100");
                    api.LMSSetValue("cmi.suspend_data",       buildUdutuSuspendString());
                    api.LMSSetValue("cmi.core.session_time",  "00:45:22.00");
                    api.LMSSetValue("cmi.core.lesson_status", "passed");
                    api.LMSCommit("");
                } catch(e) {}
            }

            interceptApiAssignment(window, buildUdutuSuspendString);
            [window.parent, window.top].forEach(w => {
                try { if (w && w !== window) interceptApiAssignment(w, buildUdutuSuspendString); } catch(e) {}
            });
        }

        // D. Udutu final save
        if (targetWin && typeof targetWin.saveProgress === 'function') {
            try { targetWin.saveProgress(true); } catch(e) {}
        }

        // E. Iframe observer for SPA navigation
        installIframeObserver(buildUdutuSuspendString);

        // F. Articulate Storyline / Rise — active hooks + method calls
        (function() {
            const player = window.player ||
                (typeof window.GetPlayer === 'function' ? (() => { try { return window.GetPlayer(); } catch(e) { return null; } })() : null);
            if (player && isArticulatePlayer(player)) {
                console.log("[+] Articulate player found — activating.");
                activateArticulate(player);
            }
        })();

        // G. Adobe Captivate — active hooks + variable writes
        if (window.cpAPIInterface) {
            console.log("[+] Captivate cpAPIInterface found — activating.");
            activateCaptivate(window.cpAPIInterface);
        }

        // H. Canvas LMS — fire module item completion
        fireCanvasCompletion();

        // I. Lectora — variable traps installed passively; try any exposed save functions
        (function() {
            ['saveResults', 'exitCourse', 'saveCourse', 'submitResults'].forEach(fn => {
                try { if (typeof window[fn] === 'function') window[fn](); } catch(e) {}
            });
        })();

        // J. HTML5 Video — force all loaded videos to 100% + watch for new ones
        // Covers: Teachable video compliance, Cybrary video lessons, EC-Council CodeRed
        installVideoCompletionHook();

        console.log("%c[HOOK ACTIVE] SCORM, AICC, Lectora, Articulate, Captivate, Moodle, Canvas, H5P, D2L, Teachable, Cybrary, CodeRed hooks attached.", "color: green; font-weight: bold;");
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
            position: 'fixed', display: 'none', zIndex: '2147483647',
            backgroundColor: '#1e1e2e', color: '#cdd6f4',
            fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '13px',
            minWidth: '150px', boxShadow: '0px 4px 12px rgba(0,0,0,0.4)',
            borderRadius: '6px', padding: '4px 0', border: '1px solid #45475a',
            cursor: 'pointer', userSelect: 'none'
        });

        const menuItem = document.createElement('div');
        menuItem.innerText = '⚡ SCORM Pass';
        Object.assign(menuItem.style, { padding: '8px 12px', transition: 'background 0.2s ease', fontWeight: '500' });
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
