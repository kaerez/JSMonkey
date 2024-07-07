// ==UserScript==
// @name         Link It
// @namespace    https://github.com/kaerez/JSMonkey
// @version      1.3.1
// @description  Insert link at the top of a page
// @author       EK
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @supportURL   https://github.com/kaerez/JSMonkey
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/Link/link.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/Link/link.user.js
// @run-at       document-start
// ==/UserScript==

'use strict';

const URI = GM_getValue("URI", "https://www.example.org");
const tgt = GM_getValue("Target", "https://www.example.com");
const name = GM_getValue("Name", "Hello");

function setdata(){
	GM_setValue("URI", prompt("URI to activate on?"))
	GM_setValue("Name", prompt("Link name?"))
	GM_setValue("Target", prompt("Pointing to where?"))
}

if (location.href.startsWith(URI)) {
	var newHTML = document.createElement ('div');
	newHTML.innerHTML = '<br><div style="background-color:red;font-size:1000%;text-align:center;"><a href='+tgt+'>'+name+'</a></div><br>';
	//document.body.appendChild (newHTML);
	document.body.insertBefore (newHTML, document.body.firstChild);
}
console.log("location.href.startsWith(URI): "+location.href.startsWith(URI))
console.log("location.href: "+location.href)
console.log("URI: "+URI)
GM.registerMenuCommand("Reset and configure", setdata);
