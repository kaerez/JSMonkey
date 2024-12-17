// ==UserScript==
// @name         Wayback Tools
// @namespace    https://github.com/kaerez/JSMonkey
// @version      1.0
// @description  Wayback Tools
// @author       EK
// @match        *://*/*
// @include      *
// @noframes
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/Wayback/wayback.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/Wayback/wayback.user.js
// ==/UserScript==

function saveArchivetoday(){
//    GM_openInTab('https://archive.today/?run=1&url=' + document.location.href,true);
      GM_openInTab('https://archive.ph/run=1&url=' + tgt,true);
}

function getArchivetoday(){
//    location.href = 'https://archive.today/newest/' + document.location.href;
      location.href = 'https://archive.ph/newest/' + tgt;
    /*
Each page has short url http://archive.is/XXXXX, where XXXXX is the unique indentfier of a page. Also, the page can be refered with urls like
  1.http://archive.is/2013/http://www.google.de/ - the newest snapshot in year 2013.
  2.http://archive.is/201301/http://www.google.de/ - the newest snapshot in January 2013.
  3.http://archive.is/20130101/http://www.google.de/ - the newest snapshot within the day of 1st January 2013.
The date can be extended further with hours, minutes and seconds:
  1.http://archive.is/2013010103/http://www.google.de/
  2.http://archive.is/201301010313/http://www.google.de/
  3.http://archive.is/20130101031355/http://www.google.de/
Year, month, day, hours, minutes and seconds can be separated with dots, dash or colons to increase readability:
  1.http://archive.is/2013-04-17/http://blog.bo.lt/
  2.http://archive.is/2013.04.17-12:08:20/http://blog.bo.lt/
It is also possible to refer all snapshots of the given url: http://archive.is/http://www.google.de/
All saved pages from the domain: http://archive.is/www.google.de
All saved pages from all the subdomains: http://archive.is/*.google.de
Oldest: http://archive.is/oldest/http://reddit.com/
More questions and answers: http://blog.archive.is/archive
    */
}

function googleCache(){
    location.href = 'http://webcache.googleusercontent.com/search?q=cache:' + tgt;
}

function getWayback(){
    location.href = 'https://web.archive.org/web/2/' + tgt;
}

function saveWayback(){
    GM_openInTab('https://web.archive.org/save/' + tgt,true);
}

function menuWayback(){
    let url = location.href;
    let newUrl = url.replace(/(https:\/\/web\.archive\.org\/web\/\d{14})(\/.*)/, '$1if_$2');
    location.href = newUrl;
    /*
    id_ Identity - perform no alterations of the original resource, return it as it was archived.
    js_ JavaScript - return document marked up as JavaScript.
    cs_ CSS - return document marked up as CSS.
    im_ Image - return document as an image.
    if_ or fw_ Iframe - return document formatted normally, but without the navigational toolbar.
    */
}

function orgWayback(){
    let url = location.href;
    let newUrl = url.replace(/(https:\/\/web\.archive\.org\/web\/\d{14})(\/.*)/, '$1id_$2');
    location.href = newUrl;
    /*
    id_ Identity - perform no alterations of the original resource, return it as it was archived.
    js_ JavaScript - return document marked up as JavaScript.
    cs_ CSS - return document marked up as CSS.
    im_ Image - return document as an image.
    if_ or fw_ Iframe - return document formatted normally, but without the navigational toolbar.
    */
}

function imgWayback(){
    let url = location.href;
    let newUrl = url.replace(/(https:\/\/web\.archive\.org\/web\/\d{14})(\/.*)/, '$1im_$2');
    /*
    id_ Identity - perform no alterations of the original resource, return it as it was archived.
    js_ JavaScript - return document marked up as JavaScript.
    cs_ CSS - return document marked up as CSS.
    im_ Image - return document as an image.
    if_ or fw_ Iframe - return document formatted normally, but without the navigational toolbar.
    */
}


let tgt;

if (!location.href.toLowerCase().startsWith("http")) {
    tgt = window.loadTimeDataRaw.reloadButton.reloadUrl;
} else {
    tgt = document.location.href;
}

if (location.href.startsWith("https://web.archive.org/web/")) {
    GM_registerMenuCommand("Wayback Remove Menu", menuWayback);
    GM_registerMenuCommand("Wayback Original View", orgWayback);
    GM_registerMenuCommand("Wayback Image View", imgWayback);
}
if (!location.href.startsWith("https://web.archive.org/web/")) {
    GM.registerMenuCommand("Get Wayback", getWayback);
    GM.registerMenuCommand("Save Wayback", saveWayback);
    GM.registerMenuCommand("Get Google Cache", googleCache);
    GM.registerMenuCommand("Get Archive Today", getArchivetoday);
    GM.registerMenuCommand("Save Archive Today", saveArchivetoday);
}

/*
if (location.href.startsWith("https://web.archive.org/web/")) {
    GM_registerMenuCommand("Wayback Remove Menu", menuWayback);
    GM_registerMenuCommand("Wayback Original View", orgWayback);
    GM_registerMenuCommand("Wayback Image View", imgWayback);
}
else {
    GM.registerMenuCommand("Get Wayback", getWayback);
    GM.registerMenuCommand("Save Wayback", saveWayback);
    GM.registerMenuCommand("Get Google Cache", googleCache);
    GM.registerMenuCommand("Get Archive Today", getArchivetoday);
    GM.registerMenuCommand("Save Archive Today", saveArchivetoday);
}

*/
