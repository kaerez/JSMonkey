// ==UserScript==
// @name         Perma.cc
// @namespace    https://github.com/kaerez/jsmonkey-pub
// @version      1.0
// @description  Save to Perma.cc
// @author       EK
// @match        *://*/*
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @icon         https://github.com/kaerez/jsmonkey-pub/Perma.cc/static/icon.png
// @noframes
// @supportURL   https://github.com/kaerez/jsmonkey-pub/Perma.cc
// @downloadURL  https://raw.githubusercontent.com/kaerez/jsmonkey-pub/main/Perma.cc/permacc.js
// @updateURL    https://raw.githubusercontent.com/kaerez/jsmonkey-pub/main/Perma.cc/permacc.js
// ==/UserScript==


function savepermacc(){
    GM_openInTab('https://perma.cc/service/bookmarklet-create/?v=1&url='+encodeURIComponent(location.href),true);
}

function downpermacc(){
    var currentUrl = window.location.href;
    var urlPattern = /^https?:\/\/(www\.)?perma\.cc\/([^?&/\\]*)/i;
    var matches = currentUrl.match(urlPattern);

    if (!matches || matches.length < 3) {
        return; // Stop and do nothing if no valid fragment is found
    }
    GM_openInTab(currentUrl+'?type=warc_download',true);
}

if (location.href.startsWith("https://perma.cc/")) {
    GM.registerMenuCommand("Download WARC Archive", downpermacc);
}
else {
    GM.registerMenuCommand("Save", savepermacc);
}
