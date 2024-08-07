// ==UserScript==
// @name         Perma.cc
// @namespace    https://github.com/kaerez/JSMonkey
// @version      1.4
// @description  Perma.cc tools
// @author       EK
// @match        *://*/*
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/Perma.cc/permacc.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/Perma.cc/permacc.user.js
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
    } else {
        location.href = location.href+'?type=warc_download';
    }
}

function getjson(){
    var currentUrl = window.location.href;
    var urlPattern = /^https?:\/\/(www\.)?perma\.cc\/([^?&/\\]*)/i;
    var matches = currentUrl.match(urlPattern);

    if (!matches || matches.length < 3) {
        return; // Stop and do nothing if no valid fragment is found
    } else {
        location.href = 'https://api.perma.cc/v1/public/archives/'+matches[2];
    }
}

function downapipermacc(){
    var currentUrl = window.location.href;
    var urlPattern = /^https?:\/\/(www\.)?perma\.cc\/([^?&/\\]*)/i;
    var matches = currentUrl.match(urlPattern);

    if (!matches || matches.length < 3) {
        return; // Stop and do nothing if no valid fragment is found
    } else {
        location.href = 'https://api.perma.cc/v1/public/archives/'+matches[2]+'/download';
    }
}

https://api.perma.cc/v1/public/archives/Y6JJ-TDUJ/download

if (location.href.startsWith("https://perma.cc/")) {
    GM.registerMenuCommand("Download WARC Archive", downpermacc);
    GM.registerMenuCommand("Get Record JSON via API", getjson);
    GM.registerMenuCommand("Download WARC Archive via API", downapipermacc);

}
else {
    GM.registerMenuCommand("Save", savepermacc);
}
