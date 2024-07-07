// ==UserScript==
// @name         Hypothes.is
// @namespace    https://github.com/kaerez/JSMonkey
// @version      1.0
// @description  Hypothes.is tools
// @author       EK
// @match        *://*/*
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/Hypothes.is/hypothesis.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/Hypothes.is/hypothesis.user.js
// ==/UserScript==


function hypothesisme(){
    (function(){window.hypothesisConfig=function(){return{showHighlights:true,appType:'bookmarklet'};};var d=document,s=d.createElement('script');s.setAttribute('src','https://hypothes.is/embed.js');d.body.appendChild(s)})();
}

function hypothesisproxy(){
    location.href = 'hhttps://via.hypothes.is/' + document.location.href;
}

GM.registerMenuCommand("hypothes.is Me", hypothesisme);
GM.registerMenuCommand("hypothes.is Proxy", hypothesisproxy);
