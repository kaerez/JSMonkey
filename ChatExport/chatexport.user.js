// ============================================
// ChatExport/chatexport.user.js
// ============================================

// ==UserScript==
// @name         ChatExport — Claude · ChatGPT · Gemini
// @namespace    https://www.kalman.co.il/
// @version      1.0.0
// @description  Export a chat with per-part selection — prompts, files, thinking, tool use, code, artifacts — to Markdown, text, JSON, PDF or a ZIP of its files.
// @author       EK
// @license      AGPL-3.0-or-later
// @homepageURL  https://www.kalman.co.il/
// @supportURL   https://www.kalman.co.il/
// @downloadURL  https://raw.githubusercontent.com/kaerez/JSMonkey/main/ChatExport/chatexport.user.js
// @updateURL    https://raw.githubusercontent.com/kaerez/JSMonkey/main/ChatExport/chatexport.user.js
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

/* -----------------------------------------------------------------------
 * @grant none is REQUIRED, not a default left in place.
 *
 * It is what makes the script run in the page's own context. Switch it to any
 * GM_* grant and the script moves into an isolated sandbox where
 * window.WIZ_global_data (Gemini's RPC parameters), CodeMirror's view object
 * and window.monaco are all invisible — the Gemini transcript loader and the
 * editor-model reads stop working, and same-origin credentialed fetches change
 * behaviour. Leave it as none.
 *
 * On Chrome with Tampermonkey MV3 you must enable Developer Mode in
 * chrome://extensions for userscripts to run at all.
 *
 * Generated from chat-export-console.js — edit that file, not this one.
 * --------------------------------------------------------------------- */

(function () {
  'use strict';

  const onTarget = () => {
    const host = location.hostname;
    if (/(^|\.)claude\.ai$/i.test(host)) return true;
    if (/(^|\.)(chatgpt\.com|chat\.openai\.com)$/i.test(host)) return true;
    if (/(^|\.)gemini\.google\.com$/i.test(host)) return true;
    return false;
  };

  let booted = false;
  const boot = () => {
    if (booted || !onTarget()) return;
    booted = true;
    start();
  };

  function start() {
(() => {
  'use strict';

  const NS = '__chatExporter';
  if (window[NS] && window[NS].open) { window[NS].open(); return; }

  const ADAPTERS = [
    {
      id: 'claude',
      test: () => /(^|\.)claude\.ai$/i.test(location.hostname),
      turnSelectors: [
        '[data-testid="user-message"]',
        '[data-testid="assistant-message"]',
        'div.font-claude-response',
        'div.font-claude-message',
      ],
      roleOf: el =>
        (el.matches('[data-testid="user-message"]') || el.closest('[data-testid="user-message"]'))
          ? 'user' : 'assistant',
      kindSelectors: {
        thinking:   ['[data-testid*="thinking" i]', '[class*="thinking" i]', '[class*="thought" i]'],
        tool:       ['[data-testid*="tool" i]', '[class*="tool-use" i]', '[class*="tool_use" i]'],
        artifact:   ['[data-testid*="artifact" i]', '[class*="artifact" i]'],
        attachment: ['[data-testid*="file-thumbnail" i]', '[data-testid*="attachment" i]'],
      },
      panelSelectors: ['[class*="artifact" i][class*="panel" i]', '[data-testid*="artifact-panel" i]', 'aside'],
    },
    {
      id: 'chatgpt',
      test: () => /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i.test(location.hostname),
      turnSelectors: ['[data-message-author-role]'],
      roleOf: el => el.getAttribute('data-message-author-role') || 'assistant',
      kindSelectors: {
        thinking:   ['[data-testid*="thought" i]', '[class*="thinking" i]', '[class*="reason" i]'],
        tool:       ['[data-testid*="tool" i]', '[class*="tool" i]'],
        artifact:   ['[class*="canvas" i]'],
        attachment: ['[data-testid*="attachment" i]', '[class*="attachment" i]'],
      },
      panelSelectors: ['#canvas', 'section[aria-label*="canvas" i]', '[class*="canvas" i][class*="panel" i]'],
    },
    {
      id: 'gemini',
      test: () => /(^|\.)gemini\.google\.com$/i.test(location.hostname),
      turnSelectors: ['user-query', 'model-response'],
      roleOf: el => (el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant'),
      kindSelectors: {
        thinking:   ['model-thoughts', '[class*="thought" i]'],
        tool:       ['[class*="tool" i]'],
        artifact:   ['immersive-editor', '[class*="immersive" i]'],
        attachment: ['[class*="uploaded" i]', '[class*="attachment" i]'],
      },
      panelSelectors: ['immersive-editor', 'code-immersive-panel', 'text-immersive-panel',
                       '[class*="immersive-panel" i]', '[class*="immersive-editor" i]'],
    },
    {
      id: 'generic',
      test: () => true,
      turnSelectors: ['[data-message-author-role]', 'article', '[class*="message" i]'],
      roleOf: el => {
        const probe = el.querySelector && el.querySelector('[data-message-author-role]');
        const s = el.getAttribute('data-message-author-role')
          || (probe && probe.getAttribute('data-message-author-role'))
          || (typeof el.className === 'string' ? el.className : '');
        return /user|human|you\b|prompt/i.test(s) ? 'user' : 'assistant';
      },
      kindSelectors: {
        thinking:   ['[class*="think" i]', '[class*="reason" i]'],
        tool:       ['[class*="tool" i]'],
        artifact:   ['[class*="artifact" i]'],
        attachment: ['[class*="attach" i]'],
      },
      panelSelectors: ['aside', '[class*="panel" i]', '[role="complementary"]'],
    },
  ];

  const adapter = ADAPTERS.find(a => { try { return a.test(); } catch { return false; } });

  const kindOf = k => KIND[k] || { label: k || 'Part', short: k || 'part' };

  const GROUPS = [
    { id: 'prompt',   label: 'Prompt',           kinds: ['user'] },
    { id: 'files',    label: 'Files & images',   kinds: ['attachment', 'image'] },
    { id: 'process',  label: 'Thinking & tools', kinds: ['thinking', 'tool'] },
    { id: 'response', label: 'Response',         kinds: ['text', 'code', 'artifact', 'render'] },
  ];
  const groupOf = kind => (GROUPS.find(g => g.kinds.includes(kind)) || { id: 'other' }).id;

  const KIND = {
    user:       { label: 'Prompt',     short: 'prompt' },
    text:       { label: 'Reply',      short: 'reply' },
    thinking:   { label: 'Thinking',   short: 'thinking' },
    tool:       { label: 'Tool use',   short: 'tool' },
    code:       { label: 'Code block', short: 'code' },
    artifact:   { label: 'Artifact',   short: 'artifact' },
    render:     { label: 'Rendered view', short: 'rendered' },
    image:      { label: 'Image',      short: 'image' },
    attachment: { label: 'Attachment', short: 'file' },
  };

  const SKIP_TAGS = new Set(
    ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS', 'TEMPLATE', 'IFRAME', 'BUTTON', 'SELECT', 'OPTION']);
  const NOISE_RE = /^(copy|copied|copy code|edit|retry|share|good response|bad response|regenerate|read aloud|expand|collapse|show more|show less)$/i;

  function toMd(node, ctx) {
    ctx = ctx || { depth: 0 };
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node;
    const tag = el.tagName;
    if (SKIP_TAGS.has(tag)) return '';
    if (el.getAttribute('aria-hidden') === 'true') return '';
    const cls = typeof el.className === 'string' ? el.className : '';
    if (/\bsr-only\b|\bvisually-hidden\b/.test(cls)) return '';
    if (el.children.length === 0 && NOISE_RE.test((el.textContent || '').trim())) return '';

    const kids = c => Array.from(el.childNodes).map(n => toMd(n, c || ctx)).join('');

    switch (tag) {
      case 'BR': return '\n';
      case 'HR': return '\n\n---\n\n';
      case 'P':  return '\n\n' + kids().trim() + '\n\n';
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const t = kids().trim();
        return t ? '\n\n' + '#'.repeat(+tag[1]) + ' ' + t + '\n\n' : '';
      }
      case 'STRONG': case 'B': { const t = kids().trim(); return t ? `**${t}**` : ''; }
      case 'EM': case 'I':     { const t = kids().trim(); return t ? `*${t}*` : ''; }
      case 'DEL': case 'S':    { const t = kids().trim(); return t ? `~~${t}~~` : ''; }
      case 'CODE': {
        if (el.closest('pre')) return kids();
        const t = (el.textContent || '').trim();
        return t ? '`' + t.replace(/`/g, '\u200b`') + '`' : '';
      }
      case 'PRE': {
        const code = el.querySelector('code') || el;
        const m = /language-([\w+#.-]+)/.exec(typeof code.className === 'string' ? code.className : '');
        let lang = m ? m[1] : (el.getAttribute('data-language') || '');
        if (!lang) {
          const head = el.previousElementSibling
            || (el.parentElement && el.parentElement.previousElementSibling);
          const t = head ? (head.textContent || '').trim() : '';
          if (/^[\w+#.-]{1,16}$/.test(t) && !/^copy$/i.test(t)) lang = t.toLowerCase();
        }
        const body = (code.textContent || '').replace(/\n+$/, '');
        return '\n\n```' + lang + '\n' + body + '\n```\n\n';
      }
      case 'A': {
        const t = kids().trim();
        const href = el.getAttribute('href') || '';
        if (!t) return '';
        return /^(https?:|mailto:)/i.test(href) ? `[${t}](${href})` : t;
      }
      case 'IMG': {
        const alt = el.getAttribute('alt') || '';
        const src = el.currentSrc || el.getAttribute('src') || '';
        return /^(https?:|blob:|data:image\/)/i.test(src)
          ? `![${alt}](${src})`
          : (alt ? `[image: ${alt}]` : '');
      }
      case 'UL': case 'OL': {
        const ordered = tag === 'OL';
        const start = parseInt(el.getAttribute('start') || '1', 10) || 1;
        const items = Array.from(el.children).filter(c => c.tagName === 'LI');
        const pad = '  '.repeat(ctx.depth);
        const rows = items.map((li, i) => {
          const inner = Array.from(li.childNodes)
            .map(n => toMd(n, { depth: ctx.depth + 1 })).join('').trim();
          const marker = ordered ? `${start + i}. ` : '- ';
          return inner.split('\n')
            .map((l, j) => (j === 0 ? pad + marker + l : pad + '  ' + l)).join('\n');
        }).filter(Boolean);
        return rows.length ? '\n\n' + rows.join('\n') + '\n\n' : '';
      }
      case 'BLOCKQUOTE': {
        const t = kids().trim();
        return t ? '\n\n' + t.split('\n').map(l => '> ' + l).join('\n') + '\n\n' : '';
      }
      case 'TABLE': {
        const rows = Array.from(el.querySelectorAll('tr'));
        if (!rows.length) return '';
        const cells = r => Array.from(r.children)
          .map(c => toMd(c, ctx).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'));
        const head = cells(rows[0]);
        const body = rows.slice(1).map(cells);
        const line = a => '| ' + a.join(' | ') + ' |';
        return '\n\n' + [line(head), line(head.map(() => '---')), ...body.map(line)].join('\n') + '\n\n';
      }
      case 'DIV': case 'SECTION': case 'ARTICLE': case 'MAIN': case 'LI':
        return '\n' + kids() + '\n';
      default:
        return kids();
    }
  }

  const cleanMd = s => String(s)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const langOfFence = md => (/^\s*`{3,}([\w+#.-]+)/.exec(String(md)) || [])[1] || '';

  const balanceFences = body => {
    const lines = String(body).split('\n');
    let open = 0;
    for (const l of lines) {
      const m = /^\s*(`{3,})\s*(\S*)/.exec(l);
      if (!m) continue;
      const len = m[1].length;
      if (!open) open = len;
      else if (len >= open && !m[2]) open = 0;
    }
    return open ? String(body).replace(/\s*$/, '') + '\n' + '`'.repeat(open) : body;
  };

  const fenceFor = body => {
    const runs = String(body).match(/^\s*`{3,}/gm) || [];
    const longest = runs.reduce((n, r) => Math.max(n, r.trim().length), 0);
    return '`'.repeat(Math.max(3, longest + 1));
  };

  const mdToPlain = md => cleanMd(
    md.replace(/^\s*`{3,}[\w+#.-]*\s*$/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[image: $1 $2]')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/^\s*---\s*$/gm, '─'.repeat(60))
  );

  const NON_CONTENT = new Set(
    ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'IFRAME', 'SVG', 'CANVAS']);
  const isContent = el => el && el.nodeType === Node.ELEMENT_NODE && !NON_CONTENT.has(el.tagName);

  const outermost = els => els.filter(e => !els.some(o => o !== e && o.contains(e)));

  function queryAll(root, selectors) {
    const out = [];
    for (const sel of selectors) {
      try { out.push(...root.querySelectorAll(sel)); } catch {  }
    }
    return out;
  }

  function heuristicKind(el) {
    if (el.tagName === 'PRE' || el.tagName === 'CODE') return null;
    if (el.closest && el.closest('pre')) return null;
    const testid = el.getAttribute ? (el.getAttribute('data-testid') || '') : '';
    const cls = typeof el.className === 'string' ? el.className : '';
    const s = (testid + ' ' + cls).toLowerCase().replace(/\blanguage-\S+/g, '');
    if (/think|thought|reason/.test(s)) return 'thinking';
    if (/tool|function.?call|terminal|command|execut|analysis/.test(s)) return 'tool';
    if (/artifact|canvas|immersive/.test(s)) return 'artifact';
    if (/attach|upload|file-?chip|thumbnail/.test(s)) return 'attachment';
    if (el.tagName === 'DETAILS') {
      const sum = el.querySelector('summary');
      const t = (sum ? sum.textContent : '').toLowerCase();
      if (/think|thought|reason/.test(t)) return 'thinking';
      if (/tool|search|analy|running|command|code/.test(t)) return 'tool';
    }
    return null;
  }

  function findSpecials(turn) {
    const found = new Map();
    const ks = adapter.kindSelectors || {};
    for (const kind of Object.keys(ks)) {
      for (const el of queryAll(turn, ks[kind])) {
        if (el !== turn && !found.has(el)) found.set(el, kind);
      }
    }
    for (const el of turn.querySelectorAll('*')) {
      if (found.has(el) || el === turn) continue;
      const k = heuristicKind(el);
      if (k) found.set(el, k);
    }
    const keys = Array.from(found.keys());
    const keep = new Map();
    for (const el of outermost(keys)) {
      const len = (el.textContent || '').trim().length;
      if (len >= 12) keep.set(el, found.get(el));
    }
    return keep;
  }

  function segment(turn, role) {
    const specials = findSpecials(turn);
    const hasSpecial = el => {
      for (const s of specials.keys()) if (el.contains(s)) return true;
      return false;
    };

    const parts = [];
    let buf = [];

    const flush = () => {
      if (!buf.length) return;
      const nodes = buf; buf = [];
      let run = [];
      const pushRun = () => {
        if (!run.length) return;
        const md = cleanMd(run.map(n => toMd(n)).join('\n'));
        if (md) parts.push({ kind: role === 'user' ? 'user' : 'text', md });
        run = [];
      };
      const loneImg = n => {
        if (n.nodeType !== Node.ELEMENT_NODE) return null;
        if (n.tagName === 'IMG') return n;
        const img = n.querySelector && n.querySelector('img');
        return img && !(n.textContent || '').trim() ? img : null;
      };
      const preIn = n => n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'PRE'
        && n.querySelector && n.querySelector('pre');
      const headerFor = n => {
        if (n.nodeType !== Node.ELEMENT_NODE) return null;
        const t = (n.textContent || '').trim();
        if (!/^[\w+#.-]{1,16}$/.test(t) || /^copy$/i.test(t)) return null;
        const nx = n.nextElementSibling;
        if (!nx) return null;
        const pre = nx.tagName === 'PRE' ? nx : (nx.querySelector && nx.querySelector('pre'));
        return pre ? t.toLowerCase() : null;
      };

      const langHints = new Map();
      const walkPre = list => {
        for (const n of list) {
          const hdr = headerFor(n);
          if (hdr) {
            const nx = n.nextElementSibling;
            langHints.set(nx.tagName === 'PRE' ? nx : nx.querySelector('pre'), hdr);
            continue;
          }
          const img = loneImg(n);
          if (img) {
            const md = cleanMd(toMd(img));
            if (md) { pushRun(); parts.push({ kind: 'image', md, el: img, alt: img.getAttribute('alt') || '' }); }
            continue;
          }
          if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'PRE') {
            pushRun();
            const md = cleanMd(toMd(n));
            if (md) parts.push({ kind: 'code', md, el: n, lang: langOfFence(md) || langHints.get(n) || '' });
            continue;
          }
          if (preIn(n)) { walkPre([...n.childNodes]); continue; }
          run.push(n);
        }
      };
      walkPre(nodes);
      pushRun();
    };

    (function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && specials.has(child)) {
          flush();
          const kind = specials.get(child);
          const md = cleanMd(toMd(child));
          if (md) parts.push({ kind, md, el: child });
        } else if (child.nodeType === Node.ELEMENT_NODE && hasSpecial(child)) {
          walk(child);
        } else {
          buf.push(child);
        }
      }
    })(turn);
    flush();

    return parts.filter(p => p.md && p.md.trim());
  }

  function contentRoot() {
    const cands = [...document.querySelectorAll('main, [role="main"]'), document.body]
      .filter(Boolean);
    let best = document.body, bestScore = -1;
    for (const el of cands) {
      if (el !== document.body && !document.body.contains(el)) continue;
      const heads = el.querySelectorAll('h1, h2, h3').length;
      const len = (el.textContent || '').trim().length;
      const score = heads * 100000 + Math.min(len, 99999);
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  function collectTurns() {
    const turns = outermost(queryAll(contentRoot(), adapter.turnSelectors));
    turns.sort((a, b) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    return turns;
  }

  function buildTurn(el, prevRole) {
    if (!isContent(el)) return { role: 'assistant', el, parts: [] };
    let role = 'assistant';
    try { role = adapter.roleOf(el, prevRole) || 'assistant'; } catch {  }
    if (role !== 'user' && role !== 'assistant') role = role === 'system' ? 'system' : 'assistant';
    const parts = segment(el, role);
    for (const p of parts) {
      if (p.kind !== 'artifact' || p.panel) continue;
      const lines = p.md.split('\n').filter(l => l.trim()).length;
      if (p.md.length < 200 && lines <= 3 && !/`{3,}/.test(p.md)) p.stub = true;
    }
    return { role, el, parts };
  }

  function scrape() {
    const turns = collectTurns();
    const raw = [];
    let prev = null;
    for (const el of turns) {
      const t = buildTurn(el, prev);
      prev = t.role;
      raw.push(t);
    }

    const panels = capturePanels(turns);
    if (panels.length) {
      const host = [...raw].reverse().find(m => m.role === 'assistant');
      if (host) host.parts.push(...panels);
      else raw.push({ role: 'assistant', parts: panels });
    }

    return finalize(raw);
  }

  function capturePanels(turns) {
    const sels = adapter.panelSelectors || [];
    if (!sels.length) return [];
    const candidates = outermost(queryAll(document.body, sels))
      .filter(el => !turns.some(t => t.contains(el) || el.contains(t)));

    const out = [];
    for (const el of candidates) {
      const cm = el.querySelector('.cm-content, .monaco-editor .view-lines, .ace_text-layer');
      let body = '', partial = false;
      if (cm) {
        const lines = cm.querySelectorAll('.cm-line, .view-line, .ace_line');
        body = [...(lines.length ? lines : [cm])].map(l => l.textContent).join('\n');
        const sc = el.querySelector('.cm-scroller, .monaco-scrollable-element') || cm.parentElement;
        partial = !!(sc && sc.scrollHeight > sc.clientHeight + 40);
      } else {
        body = toMd(el);
        const sc = el.scrollHeight > el.clientHeight + 40
          ? el : el.querySelector('[style*="overflow"], .scroller');
        partial = !!(sc && sc.scrollHeight > sc.clientHeight + 40);
      }
      body = cleanMd(body);
      if (body.length < (cm ? 40 : 200)) continue;

      const title = (el.getAttribute('aria-label') || el.getAttribute('title') || 'Open panel')
        .replace(/\s+/g, ' ').trim().slice(0, 80);
      const note = partial
        ? ' — ON-SCREEN LINES ONLY, scroll the panel and rescan for the rest'
        : '';
      out.push({
        kind: 'artifact',
        panel: true,
        partial,
        md: `**${title}** (captured from the open panel${note})\n\n${fence(body)}`,
      });
    }
    return out;
  }

  function finalize(raw) {
    const msgs = [];
    for (const m of raw) {
      const parts = (m.parts || [])
        .filter(p => p && p.md && p.md.trim())
        .map((p, j) => ({ ...p, id: `m${msgs.length}p${j}`, chars: p.md.length }));
      if (!parts.length) continue;
      msgs.push({
        id: `m${msgs.length}`, index: msgs.length + 1, role: m.role, el: m.el,
        at: m.at || null, model: m.model || null, parts,
      });
    }
    return msgs;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function scrollerOf(el) {
    let n = el;
    while (n && n !== document.body && n !== document.documentElement) {
      const st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 20) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function fingerprint(el) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    return `${el.tagName}|${t.length}|${t.slice(0, 60)}|${t.slice(-40)}`;
  }

  function stitch(a, b) {
    if (!a.length) return b.slice();
    if (!b.length) return a;
    for (let k = Math.min(a.length, b.length); k > 0; k--) {
      let ok = true;
      for (let i = 0; i < k; i++) if (a[a.length - k + i] !== b[i]) { ok = false; break; }
      if (ok) return a.concat(b.slice(k));
    }
    return a.concat(b);
  }

  const LINE_SEL = '.cm-line, .view-line, .ace_line';
  const GUTTER_SEL = '.cm-gutterElement, .line-numbers, .ace_gutter-cell';

  async function readEditor(panel) {
    const content = panel.querySelector('.cm-content');
    if (content) {
      try {
        const view = content.cmView && content.cmView.view;
        const doc = view && view.state && view.state.doc;
        if (doc && typeof doc.toString === 'function') {
          const text = doc.toString();
          if (text.trim()) return { text, whole: true, how: 'editor document model' };
        }
      } catch (e) { console.debug('[chat-export] cm state unreachable', e); }
    }
    try {
      if (panel.querySelector('.monaco-editor') && window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels() || [];
        const text = models.map(m => m.getValue()).filter(Boolean).join('\n\n');
        if (text.trim()) return { text, whole: true, how: 'editor document model' };
      }
    } catch (err) { console.debug('[chat-export] monaco models unreachable', err); }

    const copied = await readViaCopyButton(panel);
    if (copied) return copied;

    if (panel.querySelector(LINE_SEL)) return scrollCapture(panel);
    return readPanelText(panel);
  }

  async function readPanelText(panel) {
    const snap = () => cleanMd(toMd(panel));
    const first = snap();
    const sc = scrollerOf(panel);
    if (!sc || sc.scrollHeight <= sc.clientHeight + 40) {
      return { text: first, whole: true, how: 'panel text, fully rendered' };
    }

    const home = sc.scrollTop;
    const steps = [first];
    for (let guard = 0; guard < 200; guard++) {
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
      sc.scrollTop += Math.max(60, sc.clientHeight * 0.8);
      await sleep(80);
      steps.push(snap());
    }
    sc.scrollTop = sc.scrollHeight;
    await sleep(80);
    const last = snap();
    sc.scrollTop = home;

    if (last === first) {
      return { text: first, whole: true, how: 'panel text, fully rendered' };
    }
    let acc = [];
    for (const st of steps.concat(last)) acc = stitch(acc, st.split('\n'));
    return {
      text: cleanMd(acc.join('\n')),
      whole: false,
      how: 'panel text stitched from scroll steps — the container recycles nodes, completeness unverifiable',
    };
  }

  const COPY_LABEL = /^(copy|copy code|copy all|copy text|copy document|copy to clipboard|copy content)$/i;

  function findCopyButton(panel) {
    const roots = [panel, panel.parentElement].filter(Boolean);
    for (const root of roots) {
      const cands = [...root.querySelectorAll('button, [role="button"], [aria-label], [title]')];
      for (const el of cands) {
        const labels = [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent]
          .map(x => (x || '').replace(/\s+/g, ' ').trim());
        if (labels.some(l => COPY_LABEL.test(l))) return el;
      }
    }
    return null;
  }

  async function readViaCopyButton(panel) {
    const btn = findCopyButton(panel);
    if (!btn) return null;
    const target = safeClickTarget(btn);
    if (!target) return null;

    let captured = null;
    let viaSelection = false;
    const clip = navigator.clipboard;
    const origWriteText = clip && clip.writeText;
    const origWrite = clip && clip.write;
    const origExec = document.execCommand;

    const onCopy = e => {
      try {
        const t = e.clipboardData && e.clipboardData.getData('text/plain');
        if (t && captured == null) captured = t;
        if (captured != null) e.preventDefault();
      } catch {  }
    };

    try {
      if (origWriteText) clip.writeText = async t => { captured = String(t); };
      if (origWrite) {
        clip.write = async items => {
          try {
            for (const it of items || []) {
              if (it.types && it.types.includes('text/plain')) captured = await (await it.getType('text/plain')).text();
            }
          } catch {  }
        };
      }
      document.addEventListener('copy', onCopy, false);
      document.execCommand = function (cmd, ...rest) {
        if (String(cmd).toLowerCase() === 'copy') {
          const ae = document.activeElement;
          if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') && typeof ae.value === 'string') {
            const a = ae.selectionStart || 0;
            const b = typeof ae.selectionEnd === 'number' ? ae.selectionEnd : ae.value.length;
            const t = ae.value.slice(a, b) || ae.value;
            if (t && captured == null) captured = t;
          } else {
            const sel = window.getSelection && window.getSelection();
            const t = sel ? sel.toString() : '';
            if (t && captured == null) { captured = t; viaSelection = true; }
          }
          return true;
        }
        return origExec.apply(document, [cmd, ...rest]);
      };

      target.click();
      for (let i = 0; i < 25 && captured == null; i++) await sleep(60);
    } finally {
      if (origWriteText) clip.writeText = origWriteText;
      if (origWrite) clip.write = origWrite;
      document.execCommand = origExec;
      document.removeEventListener('copy', onCopy, false);
    }

    if (!captured || captured.trim().length < 20) return null;
    return viaSelection
      ? { text: captured, whole: false, how: "the panel's Copy action via a DOM selection, which may cover only rendered lines" }
      : { text: captured, whole: true, how: "the panel's own Copy action" };
  }

  async function scrollCapture(panel) {
    const anchorLine = panel.querySelector(LINE_SEL);
    const sc = scrollerOf(anchorLine || panel);
    const home = sc.scrollTop;

    const byNum = new Map();
    const byGeo = new Map();
    let stitched = [];
    let lineH = 0, base = null, uniform = true, sawGutter = false, sawGeo = false;

    let seq = [];
    const idAt = new Map();
    let identityOk = true, identityGap = false;

    const mergeIdentity = (els, texts) => {
      for (let i = 0; i < els.length; i++) {
        const k = idAt.get(els[i]);
        if (k !== undefined && seq[k].text !== texts[i]) return false;
      }
      let anchorAt = -1;
      for (let i = 0; i < els.length; i++) if (idAt.has(els[i])) { anchorAt = i; break; }
      if (anchorAt === -1) {
        if (seq.length) return false;
        els.forEach((n, i) => { idAt.set(n, seq.length); seq.push({ node: n, text: texts[i] }); });
        return true;
      }
      let start = idAt.get(els[anchorAt]) - anchorAt;
      if (start < 0) {
        const pre = els.slice(0, -start).map((n, i) => ({ node: n, text: texts[i] }));
        seq = pre.concat(seq);
        idAt.clear();
        seq.forEach((e, i) => idAt.set(e.node, i));
        start = 0;
      }
      for (let i = 0; i < els.length; i++) {
        const pos = start + i;
        if (pos < seq.length) {
          if (seq[pos].node !== els[i]) return false;
        } else {
          while (seq.length < pos) { seq.push({ node: null, text: '' }); identityGap = true; }
          idAt.set(els[i], pos);
          seq.push({ node: els[i], text: texts[i] });
        }
      }
      return true;
    };

    const take = () => {
      const els = [...panel.querySelectorAll(LINE_SEL)];
      if (!els.length) return;
      const text = els.map(l => (l.textContent || '').replace(/\u200b/g, ''));

      const nums = [...panel.querySelectorAll(GUTTER_SEL)]
        .map(g => parseInt((g.textContent || '').trim(), 10))
        .filter(n => Number.isFinite(n));
      if (nums.length === els.length) {
        sawGutter = true;
        text.forEach((t, i) => byNum.set(nums[i], t));
      }

      const hs = els.map(l => l.offsetHeight || 0).filter(hh => hh > 0);
      if (hs.length === els.length) {
        if (hs.some(hh => Math.abs(hh - hs[0]) > 1)) uniform = false;
        if (!lineH) lineH = hs[0];
      } else if (els.length) {
        uniform = false;
      }
      if (base === null && els[0] && typeof els[0].offsetTop === 'number' && els[0].offsetTop >= 0) {
        base = els[0].offsetTop;
      }
      if (uniform && lineH > 0 && base !== null) {
        sawGeo = true;
        els.forEach((l, i) => {
          const idx = Math.round((l.offsetTop - base) / lineH) + 1;
          if (idx > 0) byGeo.set(idx, text[i]);
        });
      }

      if (identityOk && !mergeIdentity(els, text)) identityOk = false;
      if (!sawGutter && !sawGeo) stitched = stitch(stitched, text);
    };

    sc.scrollTop = 0; await sleep(120); take();
    for (let guard = 0; guard < 400; guard++) {
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
      sc.scrollTop += Math.max(60, sc.clientHeight * 0.8);
      await sleep(80);
      take();
    }
    take();
    sc.scrollTop = home;

    const assemble = (map, how) => {
      const last = Math.max(...map.keys());
      const lines = [];
      let gaps = 0;
      for (let i = 1; i <= last; i++) {
        if (!map.has(i)) gaps++;
        lines.push(map.get(i) ?? '');
      }
      return {
        text: lines.join('\n'),
        whole: gaps === 0,
        how: gaps ? `${how}, ${gaps} of ${last} lines never rendered` : `${how}, ${last} lines`,
      };
    };

    if (sawGutter && byNum.size) return assemble(byNum, 'line-numbered capture');
    if (identityOk && seq.length) {
      return {
        text: seq.map(e => e.text).join('\n'),
        whole: !identityGap,
        how: identityGap
          ? `node-identity merge, ${seq.filter(e => !e.node).length} lines never rendered`
          : `node-identity merge, ${seq.length} lines`,
      };
    }
    if (sawGeo && byGeo.size) return assemble(byGeo, 'position-indexed capture');

    const expected = lineH > 0 ? Math.round(sc.scrollHeight / lineH) : 0;
    const short = expected && stitched.length < expected - 1
      ? `, ${stitched.length} of about ${expected} lines`
      : `, ${stitched.length} lines`;
    return {
      text: stitched.join('\n'),
      whole: false,
      how: `stitched from scroll steps${short} — repeated lines may have merged, completeness unverifiable`,
    };
  }

  const SOURCE_TAB = /^(code|source|raw|markdown|md|text)$/i;
  const RENDER_TAB = /^(preview|rendered|render|design|display|visual|result)$/i;
  const EXT_LANG = {
    py: 'python', js: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'tsx', jsx: 'jsx',
    sh: 'bash', bash: 'bash', ps1: 'powershell', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', sql: 'sql', yaml: 'yaml', yml: 'yaml',
    json: 'json', toml: 'toml', xml: 'xml', html: 'html', css: 'css', md: 'markdown', rules: 'yaml',
  };
  const extLang = title => EXT_LANG[((/\.([a-z0-9]+)\s*$/i.exec(String(title || '')) || [])[1] || '').toLowerCase()] || '';

  function viewTabs(panel) {
    const out = { source: null, render: null };
    const cands = [...panel.querySelectorAll('button, [role="tab"], [role="radio"], [role="button"]')];
    for (const el of cands) {
      const labels = [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent]
        .map(x => (x || '').replace(/\s+/g, ' ').trim());
      if (!out.source && labels.some(l => SOURCE_TAB.test(l))) out.source = el;
      if (!out.render && labels.some(l => RENDER_TAB.test(l))) out.render = el;
    }
    return out;
  }

  const tabActive = el => !!el && (el.getAttribute('aria-selected') === 'true'
    || el.getAttribute('aria-pressed') === 'true'
    || el.getAttribute('data-state') === 'active'
    || /\b(active|selected)\b/.test(typeof el.className === 'string' ? el.className : ''));

  async function readArtifactViews(panel) {
    const tabs = viewTabs(panel);
    const wasOn = tabActive(tabs.source) ? 'source' : tabActive(tabs.render) ? 'render' : null;
    const views = [];

    const clickTab = async el => {
      const t = el && safeClickTarget(el);
      if (!t) return false;
      t.click();
      await sleep(240);
      return true;
    };

    if (state.opts.viewSource) {
      if (tabs.source && !tabActive(tabs.source)) await clickTab(tabs.source);
      const res = await readEditor(panel);
      if (res && res.text && res.text.trim().length >= 20) views.push({ kind: 'artifact', ...res });
    }
    if (state.opts.viewRendered && tabs.render) {
      if (!tabActive(tabs.render)) await clickTab(tabs.render);
      const res = await readPanelText(panel);
      if (res.text.length >= 20) {
        views.push({
          kind: 'render', text: res.text, whole: res.whole,
          how: res.whole ? 'rendered view' : 'rendered view, ' + res.how,
        });
      }
    }
    if (!views.length) {
      const res = await readEditor(panel);
      if (res && res.text && res.text.trim().length >= 20) views.push({ kind: 'artifact', ...res });
    }

    if (wasOn === 'source' && !tabActive(tabs.source)) await clickTab(tabs.source);
    else if (wasOn === 'render' && !tabActive(tabs.render)) await clickTab(tabs.render);

    return { views, multi: !!(tabs.source && tabs.render) };
  }

  const DESTRUCTIVE = /\b(delete|remove|discard|regenerate|retry|clear|reset|sign ?out|log ?out|unpublish|revoke|cancel subscription)\b/i;

  function safeClickTarget(el) {
    const t = (el.closest && el.closest('button, [role="button"], a, [tabindex]')) || el;
    const label = ((t.getAttribute && (t.getAttribute('aria-label') || t.getAttribute('title') || '')) + ' '
      + (t.textContent || '')).slice(0, 240);
    if (DESTRUCTIVE.test(label)) {
      console.warn('[chat-export] refusing to click an element labelled:', label.trim().slice(0, 80));
      return null;
    }
    return t;
  }

  async function openPanel(el) {
    const sels = adapter.panelSelectors || [];
    if (!sels.length) return null;
    const before = new Map(outermost(queryAll(document.body, sels))
      .map(p => [p, (p.textContent || '').length]));
    const target = safeClickTarget(el);
    if (!target) return null;
    try { target.scrollIntoView({ block: 'center' }); } catch {  }
    target.click();
    for (let i = 0; i < 40; i++) {
      await sleep(80);
      const now = outermost(queryAll(document.body, sels));
      const changed = now.filter(pn => {
        const len = (pn.textContent || '').length;
        if (!before.has(pn)) {
          return len > 0 || !!pn.querySelector(
            '.cm-content, .monaco-editor, .ace_content, pre, textarea, img, canvas, svg, iframe');
        }
        return Math.abs(before.get(pn) - len) > 40;
      });
      if (changed.length) return changed[changed.length - 1];
    }
    return null;
  }

  async function sweepTurns(status) {
    const first = collectTurns()[0];
    const sc = scrollerOf(first || document.body);
    const home = sc.scrollTop;
    const seen = new Map();
    const order = [];
    const take = () => {
      let prev = null;
      for (const el of collectTurns()) {
        const fp = fingerprint(el);
        if (!seen.has(fp)) seen.set(fp, buildTurn(el, prev)), order.push(fp);
        prev = seen.get(fp).role;
      }
    };

    sc.scrollTop = 0; await sleep(160); take();
    for (let guard = 0; guard < 300; guard++) {
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
      sc.scrollTop += Math.max(60, sc.clientHeight * 0.75);
      await sleep(110);
      take();
      if (status) status(`Deep scan: scrolling the thread — ${order.length} messages so far`);
    }
    take();
    sc.scrollTop = home;
    return order.map(fp => seen.get(fp));
  }

  async function resolveStubs(raw, status) {
    const tally = { opened: 0, partial: 0, refused: 0 };
    const pending = new Map();
    for (const m of raw) {
      if (m.el && m.parts.some(p => p.kind === 'artifact' && p.stub)) pending.set(fingerprint(m.el), m);
    }
    if (!pending.size) return tally;
    const total = pending.size;

    const handle = async (msg, liveEl) => {
      const fresh = buildTurn(liveEl).parts.filter(p => p.kind === 'artifact' && p.el);
      const targets = msg.parts.filter(p => p.kind === 'artifact' && p.stub);
      for (let i = 0; i < targets.length; i++) {
        const p = targets[i];
        const live = (fresh[i] && fresh[i].el) || (document.contains(p.el) ? p.el : null);
        if (!live) { tally.refused++; continue; }
        status(`Deep scan: reading artifact ${tally.opened + tally.refused + 1} of ${total}…`);
        const panel = await openPanel(live);
        if (!panel) { tally.refused++; continue; }
        const { views, multi } = await readArtifactViews(panel);
        if (!views.length) { tally.refused++; continue; }

        const title = (live.getAttribute && (live.getAttribute('aria-label') || live.getAttribute('title')))
          || p.md.split('\n').map(l => l.trim()).filter(Boolean)[0]
          || 'Artifact';
        const lang = extLang(title);
        const render = v => {
          const head = `**${title}**${v.kind === 'render' ? ' — rendered view' : ''}`
            + ` (recovered from the panel — ${v.how})`;
          return `${head}\n\n${v.kind === 'render' ? v.text : fence(v.text, lang)}`;
        };

        const [first, ...rest] = views;
        p.kind = first.kind;
        p.md = render(first);
        p.lang = first.kind === 'artifact' ? lang : '';
        p.stub = false;
        p.panel = true;
        p.multiView = multi;
        p.partial = !first.whole;
        let slot = msg.parts.indexOf(p);
        for (const v of rest) {
          msg.parts.splice(++slot, 0, {
            kind: v.kind, md: render(v), panel: true, multiView: multi,
            partial: !v.whole, lang: v.kind === 'artifact' ? lang : '',
          });
        }
        tally.opened++;
        if (views.some(v => !v.whole)) tally.partial++;
      }
    };

    const first = collectTurns()[0];
    const sc = scrollerOf(first || document.body);
    const home = sc.scrollTop;
    const sweep = async () => {
      for (const el of collectTurns()) {
        const fp = fingerprint(el);
        const msg = pending.get(fp);
        if (!msg) continue;
        pending.delete(fp);
        await handle(msg, el);
      }
    };

    sc.scrollTop = 0; await sleep(160); await sweep();
    for (let guard = 0; guard < 300 && pending.size; guard++) {
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) break;
      sc.scrollTop += Math.max(60, sc.clientHeight * 0.75);
      await sleep(110);
      await sweep();
    }
    await sweep();
    sc.scrollTop = home;
    tally.refused += pending.size;
    return tally;
  }

  async function deepScan() {
    const status = sticky('Deep scan: scrolling the thread…');
    const mine = ++loadToken;
    let opened = 0, partial = 0, refused = 0;
    try {
      const raw = await sweepTurns(status);

      const tally = await resolveStubs(raw, status);
      opened = tally.opened; partial = tally.partial; refused = tally.refused;

      if (mine !== loadToken) { console.info('[chat-export] deep scan superseded, discarded'); return; }
      state.messages = finalize(raw);
      state.source = 'deep';
      state.sel = new Set(allParts().map(x => x.id));
      renderList(); renderChips(); updateTotals(); updateSource();
      const bits = [`${state.messages.length} messages`];
      if (opened) bits.push(`${opened} artifact bod${opened === 1 ? 'y' : 'ies'} recovered`);
      if (partial) bits.push(`${partial} incomplete`);
      if (refused) bits.push(`${refused} unreadable`);
      toast('Deep scan: ' + bits.join(', '));
    } catch (e) {
      console.warn('[chat-export] deep scan failed:', e);
      toast('Deep scan failed — see console');
    } finally {
      status(null);
    }
  }

  const fence = (body, lang) => {
    const f = fenceFor(String(body));
    return f + (lang || '') + '\n' + String(body).replace(/\n+$/, '') + '\n' + f;
  };

  const LONE_IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

  function splitFences(text) {
    const out = [];
    const lines = String(text || '').split('\n');
    let buf = [], i = 0;
    const flush = () => { const md = cleanMd(buf.join('\n')); if (md) out.push({ kind: 'text', md }); buf = []; };
    while (i < lines.length) {
      const img = LONE_IMAGE.exec(lines[i]);
      if (img) {
        flush();
        out.push({ kind: 'image', md: lines[i].trim(), alt: img[1] || '' });
        i++;
        continue;
      }
      const m = /^\s*(`{3,})/.exec(lines[i]);
      if (m) {
        flush();
        const len = m[1].length;
        const b = [lines[i++]];
        while (i < lines.length) {
          const c = /^\s*(`{3,})\s*$/.exec(lines[i]);
          b.push(lines[i++]);
          if (c && c[1].length >= len) break;
        }
        const md = cleanMd(b.join('\n'));
        if (md) out.push({ kind: 'code', md, lang: langOfFence(md) });
      } else buf.push(lines[i++]);
    }
    flush();
    return out;
  }

  let verbose = false;
  let reqCount = 0;
  let loggedHint = false;

  const jget = async (url, init) => {
    reqCount++;
    if (verbose) console.info('[chat-export] GET ' + url);
    const r = await fetch(url, Object.assign({ credentials: 'include', headers: { accept: 'application/json' } }, init));
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return r.json();
  };

  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  const idFromText = t => {
    const m = UUID_RE.exec(String(t || ''));
    return m ? m[0].toLowerCase() : null;
  };

  function idFromUrl(segments) {
    const here = location.pathname + location.search + location.hash;
    for (const seg of segments) {
      const m = new RegExp('/' + seg + '/(' + UUID_RE.source + ')', 'i').exec(here);
      if (m) return m[1].toLowerCase();
    }
    const any = UUID_RE.exec(here);
    return any ? any[0].toLowerCase() : null;
  }

  function idFromDom(segments) {
    const sels = [
      'a[aria-current="page"]', 'a[aria-current="true"]', 'a[data-state="active"]',
      'li[aria-selected="true"] a', 'a[class*="active" i]',
    ];
    for (const sel of sels) {
      for (const a of document.querySelectorAll(sel)) {
        const href = a.getAttribute('href') || '';
        if (!segments.some(seg => href.includes('/' + seg + '/'))) continue;
        const id = idFromText(href);
        if (id) return id;
      }
    }
    return null;
  }

  function claudeToolPart(b) {
    const i = b.input || {};
    if (b.name === 'artifacts') {
      const bits = [i.type, i.language].filter(Boolean).join(', ');
      const head = `**${i.title || i.id || 'Artifact'}**`
        + (i.id ? ` \`${i.id}\`` : '') + (bits ? ` (${bits})` : '')
        + (i.command ? ` · ${i.command}` : '');
      if (i.command === 'update' || i.old_str != null) {
        return { kind: 'artifact', md: `${head}\n\nReplaced:\n\n${fence(i.old_str || '')}\n\nWith:\n\n${fence(i.new_str || '', i.language || '')}` };
      }
      const body = i.content != null ? fence(i.content, i.language || '') : '_(no inline content in this command)_';
      return {
        kind: 'artifact', md: `${head}\n\n${body}`,
        lang: i.language || '',
        fileName: i.title || i.id || 'artifact',
        fileText: i.content != null ? String(i.content) : null,
      };
    }
    let args = '';
    try { args = JSON.stringify(i, null, 2); } catch { args = String(i); }
    return { kind: 'tool', md: `**${b.name || 'tool'}**\n\n${fence(args, 'json')}` };
  }

  const blockText = b => {
    if (typeof b === 'string') return b;
    if (Array.isArray(b)) return b.map(blockText).join('\n');
    if (b && typeof b === 'object') return b.text || b.thinking || b.content ? blockText(b.text || b.thinking || b.content) : '';
    return '';
  };

  function claudeMessage(msg) {
    const role = msg.sender === 'human' ? 'user' : 'assistant';
    const at = msg.created_at || null;
    const model = msg.model || null;
    const parts = [];
    const add = (kind, md) => { md = cleanMd(md); if (md) parts.push({ kind, md }); };

    for (const f of [].concat(msg.files || [], msg.attachments || [], msg.files_v2 || [])) {
      const name = f.file_name || f.file_kind || f.name || 'file';
      const src = f.preview_url || f.thumbnail_url || '';
      const isImage = /^image/i.test(f.file_kind || '') || /\.(png|jpe?g|gif|webp|avif)$/i.test(name);
      if (isImage && src) {
        let abs = src;
        try { abs = new URL(src, location.href).href; } catch {  }
        parts.push({ kind: 'image', md: `![${name}](${abs})`, alt: name });
        continue;
      }
      const md = cleanMd(`File: ${name}` + (f.extracted_content ? `\n\n${fence(f.extracted_content)}` : ''));
      if (md) {
        parts.push({
          kind: 'attachment', md,
          fileName: name,
          fileUrl: src || null,
          fileText: f.extracted_content || null,
        });
      }
    }

    const blocks = Array.isArray(msg.content) && msg.content.length
      ? msg.content : [{ type: 'text', text: msg.text || '' }];

    for (const b of blocks) {
      switch (b.type) {
        case 'text':
          splitFences(b.text || '').forEach(s => add(role === 'user' && s.kind === 'text' ? 'user' : s.kind, s.md));
          break;
        case 'thinking':
          add('thinking', b.thinking || b.text || '');
          break;
        case 'tool_use': {
          const t = claudeToolPart(b);
          const md = cleanMd(t.md);
          if (md) parts.push({ ...t, md });
          break;
        }
        case 'tool_result':
          add('tool', `**result**\n\n${fence(blockText(b.content))}`);
          break;
        default:
          if (b.text) add(role === 'user' ? 'user' : 'text', b.text);
      }
    }
    return { role, parts, at, model };
  }

  async function claudeIdFromList(orgs) {
    const want = chatTitle().trim().toLowerCase();
    const seen = [];
    for (const org of orgs) {
      let list = [];
      try { list = await jget(`/api/organizations/${org.uuid}/chat_conversations?limit=50`); }
      catch { continue; }
      for (const c of [].concat(list || [])) {
        if (!c || !c.uuid) continue;
        seen.push(c);
        if (want && String(c.name || '').trim().toLowerCase() === want) return c.uuid;
      }
    }
    if (!seen.length) return null;
    const err = new Error('could not tell which conversation this is');
    err.candidates = seen.slice(0, 10).map(c => ({ uuid: c.uuid, name: c.name }));
    throw err;
  }

  const cookie = name => {
    const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(document.cookie || '');
    return m ? decodeURIComponent(m[1]) : null;
  };

  async function claudeLoad(idHint) {
    let orgs = [].concat(await jget('/api/organizations') || []);
    if (!orgs.length) throw new Error('/api/organizations returned nothing — signed out?');

    const active = cookie('lastActiveOrg');
    if (active) orgs = orgs.slice().sort((a, b) => (b.uuid === active) - (a.uuid === active));

    const segments = ['chat', 'share', 'conversation', 'conversations'];
    let id = idFromText(idHint) || state.convId || idFromUrl(segments) || idFromDom(segments);
    if (!id) id = await claudeIdFromList(orgs);
    if (!id) throw new Error('could not identify the conversation — paste its URL in the picker');

    let conv = null, lastErr = null;
    for (const org of orgs) {
      const q = `?tree=True&rendering_mode=messages&render_all_tools=true`;
      try { conv = await jget(`/api/organizations/${org.uuid}/chat_conversations/${id}${q}`); break; }
      catch (e) { lastErr = e; }
    }
    if (!conv) throw lastErr || new Error(`conversation ${id} not found in any organization`);
    const list = conv.chat_messages || conv.messages || [];
    return { messages: finalize(list.map(claudeMessage)), title: conv.name || null, convId: id };
  }

  function chatgptMessage(msg) {
    const role = (msg.author && msg.author.role) || 'assistant';
    const c = msg.content || {};
    const recipient = msg.recipient || '';
    const parts = [];
    const add = (kind, md) => { md = cleanMd(md); if (md) parts.push({ kind, md }); };
    const joined = () => (c.parts || []).map(x => (typeof x === 'string' ? x : '')).join('\n\n');

    switch (c.content_type) {
      case 'thoughts':
        (c.thoughts || []).forEach(t => add('thinking', [t.summary ? `**${t.summary}**` : '', t.content || ''].join('\n\n')));
        break;
      case 'reasoning_recap':
        add('thinking', c.content || '');
        break;
      case 'code':
        add('tool', fence(c.text || '', c.language || ''));
        break;
      case 'execution_output':
        add('tool', `**output**\n\n${fence(c.text || '')}`);
        break;
      case 'multimodal_text':
        (c.parts || []).forEach(x => {
          if (typeof x === 'string') splitFences(x).forEach(s => add(role === 'user' && s.kind === 'text' ? 'user' : s.kind, s.md));
          else add('attachment', `File: ${x.name || x.asset_pointer || 'attachment'}`);
        });
        break;
      default: {
        const text = joined();
        if (/^canmore\./.test(recipient) || /^canmore/.test(String(msg.author && msg.author.name))) {
          let doc = null;
          try { doc = JSON.parse(text); } catch {  }
          if (doc && (doc.content != null || doc.updates)) {
            const head = `**${doc.name || 'Canvas'}**` + (doc.type ? ` (${doc.type})` : '');
            const body = doc.content != null
              ? fence(doc.content, /code\/(\w+)/.test(doc.type || '') ? RegExp.$1 : '')
              : fence(JSON.stringify(doc.updates, null, 2), 'json');
            add('artifact', `${head}\n\n${body}`);
            break;
          }
        }
        if (role === 'tool') { add('tool', text); break; }
        splitFences(text).forEach(s => add(role === 'user' && s.kind === 'text' ? 'user' : s.kind, s.md));
      }
    }
    return {
      role: role === 'user' ? 'user' : role === 'system' ? 'system' : 'assistant',
      parts,
      at: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : null,
      model: (msg.metadata && msg.metadata.model_slug) || null,
    };
  }

  async function chatgptLoad(idHint) {
    const segments = ['c', 'share', 'g'];
    const id = idFromText(idHint) || state.convId || idFromUrl(segments) || idFromDom(segments);
    if (!id) throw new Error('could not identify the conversation — paste its URL in the picker');
    const sess = await jget('/api/auth/session');
    const token = sess && sess.accessToken;
    if (!token) throw new Error('no access token in /api/auth/session');
    const conv = await jget(`/backend-api/conversation/${id}`, { headers: { accept: 'application/json', authorization: 'Bearer ' + token } });

    const chain = [];
    let node = conv.current_node;
    const seen = new Set();
    while (node && !seen.has(node)) {
      seen.add(node);
      const n = conv.mapping[node];
      if (!n) break;
      if (n.message) chain.push(n.message);
      node = n.parent;
    }
    chain.reverse();

    const messages = finalize(chain
      .filter(m => {
        const meta = m.metadata || {};
        if (meta.is_visually_hidden_from_conversation) return false;
        const role = m.author && m.author.role;
        return role !== 'system';
      })
      .map(chatgptMessage));
    return { messages, title: conv.title || null, convId: id };
  }

  const geminiId = hint => {
    const t = String(hint || location.pathname);
    const m = /(?:\/app\/|\bc_)([0-9a-f]{8,})/i.exec(t) || /^([0-9a-f]{8,})$/i.exec(t.trim());
    return m ? m[1].toLowerCase() : null;
  };

  function parseBatchExecute(text, rpcid) {
    const s2 = String(text).replace(/^\)\]\}'\s*/, '');
    const out = [];
    for (let i = 0; i < s2.length; i++) {
      if (s2[i] !== '[') continue;
      let depth = 0, inStr = false, esc = false, j = i;
      for (; j < s2.length; j++) {
        const ch = s2[j];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '[') depth++;
        else if (ch === ']' && --depth === 0) break;
      }
      if (depth !== 0) break;
      const chunk = s2.slice(i, j + 1);
      i = j;
      if (chunk.indexOf('"wrb.fr"') < 0) continue;
      try {
        for (const row of JSON.parse(chunk)) {
          if (Array.isArray(row) && row[0] === 'wrb.fr' && row[1] === rpcid && typeof row[2] === 'string') {
            out.push(JSON.parse(row[2]));
          }
        }
      } catch {  }
    }
    return out;
  }

  const unfence = t => {
    const m = /^\s*`{3,}[\w+#.-]*\n([\s\S]*?)\n?`{3,}\s*$/.exec(String(t));
    return m ? m[1] : String(t);
  };

  function geminiDocs(blk) {
    const out = [];
    for (const slot of blk || []) {
      if (!Array.isArray(slot)) continue;
      for (const cand of slot) {
        if (!Array.isArray(cand) || cand.length < 6) continue;
        const title = typeof cand[2] === 'string' ? cand[2] : '';
        const content = typeof cand[4] === 'string' ? cand[4] : '';
        const file = typeof cand[9] === 'string' ? cand[9] : '';
        if (title && title.length < 200 && content.length > 40) out.push({ title, content, file });
      }
    }
    return out;
  }

  function geminiMessages(payload) {
    const raw = [];
    for (const pair of (payload && payload[0]) || []) {
      if (!Array.isArray(pair)) continue;
      const at = (pair[4] && pair[4][0]) ? new Date(pair[4][0] * 1000).toISOString() : null;

      const prompt = pair[2] && pair[2][0] && pair[2][0][0];
      if (typeof prompt === 'string' && prompt.trim()) {
        raw.push({
          role: 'user', at,
          parts: splitFences(prompt).map(x => ({ ...x, kind: x.kind === 'text' ? 'user' : x.kind })),
        });
      }

      const blk = pair[3] && pair[3][0] && pair[3][0][0];
      if (!Array.isArray(blk)) continue;
      const parts = [];
      const text = blk[1] && blk[1][0];
      if (typeof text === 'string' && text.trim()) parts.push(...splitFences(text));
      for (const doc of geminiDocs(blk)) {
        const body = unfence(doc.content);
        const name = doc.file || doc.title;
        parts.push({
          kind: 'artifact',
          md: `**${doc.title}**${doc.file ? ` \`${doc.file}\`` : ''}\n\n${fence(body, extLang(name))}`,
          lang: extLang(name),
          fileName: name,
          fileText: body,
        });
      }
      raw.push({ role: 'assistant', at, parts });
    }
    return finalize(raw);
  }

  async function geminiLoad(idHint) {
    const g = window.WIZ_global_data || {};
    const id = geminiId(idHint) || geminiId(state.convId) || geminiId(location.pathname);
    if (!id) throw new Error('could not identify the conversation — paste its URL in the picker');
    const bl = g.cfb2h, at = g.SNlM0e, sid = g.FdrFJe;
    if (!bl || !at) throw new Error('page is missing its RPC parameters — signed out, or the app changed');

    const qs = new URLSearchParams({
      rpcids: 'hNvQHb',
      'source-path': `/app/${id}`,
      bl,
      hl: (g.yFnxrf || 'en'),
      _reqid: String(100000 + Math.floor(Math.random() * 800000)),
      rt: 'c',
    });
    if (sid) qs.set('f.sid', sid);

    const url = (g.eptZe || '/_/BardChatUi/') + 'data/batchexecute?' + qs.toString();
    const body = new URLSearchParams({
      'f.req': JSON.stringify([[['hNvQHb', JSON.stringify([`c_${id}`, 10, null, 1, [0], [4], null, 1]), null, 'generic']]]),
      at,
    });

    reqCount++;
    if (verbose) console.info('[chat-export] POST ' + url.split('?')[0] + ' (hNvQHb)');
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
    });
    if (!r.ok) throw new Error(`batchexecute -> HTTP ${r.status}`);
    const payloads = parseBatchExecute(await r.text(), 'hNvQHb');
    if (!payloads.length) throw new Error('no hNvQHb payload in the response');

    let messages = [];
    for (const pl of payloads) {
      const got = geminiMessages(pl);
      if (got.length > messages.length) messages = got;
    }
    return { messages, title: document.title.replace(/\s*[-–|]\s*Gemini.*$/i, '').trim() || null, convId: id };
  }

  const API_LOADERS = { claude: claudeLoad, chatgpt: chatgptLoad, gemini: geminiLoad };
  const apiLoader = API_LOADERS[adapter.id] || null;

  const chatTitle = () => state.apiTitle ||
    (document.title || 'conversation')
      .replace(/\s*[-–|]\s*(Claude|ChatGPT|Gemini|Google Gemini|OpenAI).*$/i, '')
      .trim() || 'conversation';

  const roleName = m => (m.role === 'user' ? 'You' : m.role === 'system' ? 'System' : 'Assistant');

  function buildMarkdown(o) {
    const opts = o || state.opts;
    if (!selectedParts().length) return '';
    const out = [];

    if (opts.frontMatter) {
      out.push(`# ${chatTitle()}`, '');
      out.push(`Source: ${location.href}`, '');
      out.push(`Exported: ${new Date().toISOString()}`, '', '---', '');
    }

    for (const m of state.messages) {
      const parts = m.parts.filter(p => state.sel.has(p.id));
      if (!parts.length) continue;

      if (opts.roleHeadings) {
        const num = opts.numbering ? `${m.index}. ` : '';
        const meta = [];
        if (opts.metaLine && m.at) meta.push(String(m.at).replace('T', ' ').replace(/\.\d+Z?$/, 'Z'));
        if (opts.metaLine && m.model) meta.push(m.model);
        out.push(`## ${num}${roleName(m)}${meta.length ? ' — ' + meta.join(' · ') : ''}`, '');
      }

      for (const p of parts) {
        const labelled = opts.partLabels && p.kind !== 'text' && p.kind !== 'user';
        if (labelled) out.push(`**${kindOf(p.kind).label}**`, '');

        let body = balanceFences(p.md);
        if (p.kind === 'thinking' && opts.quoteThinking) {
          body = body.split('\n').map(l => (l ? '> ' + l : '>')).join('\n');
        }
        if (p.kind === 'tool' && opts.fenceTool && !/^\s*`{3,}/m.test(body)) {
          const f = fenceFor(body);
          body = f + '\n' + body + '\n' + f;
        }
        out.push(body, '');
      }

      if (opts.separators) out.push('---', '');
    }

    let md = cleanMd(out.join('\n'));
    if (opts.images === 'omit') {
      md = md.replace(/!\[([^\]]*)\]\([^)\s]+\)/g, (_, alt) => `[image${alt ? ': ' + alt : ''}]`);
    }
    return md ? md + '\n' : '';
  }

  function buildJson() {
    return JSON.stringify({
      title: chatTitle(),
      exported_at: new Date().toISOString(),
      source: {
        host: location.host, url: location.href,
        adapter: adapter.id,
        mode: state.source === 'api' ? 'transcript-api'
          : state.source === 'deep' ? 'deep-scan' : 'rendered-page',
      },
      messages: state.messages.map(m => ({
        index: m.index,
        role: m.role,
        at: m.at || null,
        model: m.model || null,
        parts: m.parts.filter(p => state.sel.has(p.id)).map(p => ({
          kind: p.kind,
          language: p.lang || null,
          capture: p.panel ? (p.partial ? 'panel-partial' : 'panel') : null,
          multi_view: p.multiView || false,
          chars: p.chars,
          markdown: p.md,
        })),
      })).filter(m => m.parts.length),
    }, null, 2);
  }

  const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(~~[^~]+~~)|(!?\[[^\]]*\]\([^)\s]+\))/g;

  async function resolveImages(md, mode, status) {
    const map = new Map();
    if (mode === 'omit' || mode === 'link') return map;
    const urls = [...new Set([...String(md).matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1]))];
    let done = 0;
    for (const u of urls) {
      if (status) status(`Embedding images… ${++done}/${urls.length}`);
      try {
        if (/^data:image\//i.test(u)) { map.set(u, u); continue; }
        let sameOrigin = false;
        try { sameOrigin = new URL(u, location.href).origin === location.origin; } catch {  }
        const r = await fetch(u, { credentials: (sameOrigin || /^blob:/i.test(u)) ? 'include' : 'omit' });
        if (!r.ok) continue;
        const blob = await r.blob();
        if (!/^image\//.test(blob.type)) { console.warn('[chat-export] skipping non-image response:', u); continue; }
        if (/svg/i.test(blob.type)) { console.warn('[chat-export] not embedding SVG:', u); continue; }
        if (blob.size > 8e6) { console.warn('[chat-export] skipping image over 8 MB:', u); continue; }
        map.set(u, await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        }));
      } catch (e) { console.debug('[chat-export] image unavailable', u, e); }
    }
    return map;
  }

  function appendInline(parent, text, doc, ctx) {
    const lines = String(text).split('\n');
    lines.forEach((line, li) => {
      if (li) parent.appendChild(doc.createElement('br'));
      let last = 0, m;
      INLINE_RE.lastIndex = 0;
      while ((m = INLINE_RE.exec(line))) {
        if (m.index > last) parent.appendChild(doc.createTextNode(line.slice(last, m.index)));
        const tok = m[0];
        let node;
        if (tok.startsWith('![')) {
          const cut = tok.lastIndexOf('](');
          const alt = tok.slice(2, cut);
          const src = tok.slice(cut + 2, -1);
          const mode = (ctx && ctx.images) || 'inline';
          const resolved = ctx && ctx.imgMap ? ctx.imgMap.get(src) : null;
          if (mode === 'omit') {
            node = doc.createTextNode(`[image${alt ? ': ' + alt : ''}]`);
          } else if (!resolved && mode !== 'link') {
            node = doc.createTextNode(`[image${alt ? ': ' + alt : ''} — not embedded]`);
          } else if (mode === 'appendix') {
            ctx.appendix.push({ alt, src: resolved });
            node = doc.createTextNode(`[image ${ctx.appendix.length}${alt ? ': ' + alt : ''}]`);
          } else if (mode === 'link' && /^https?:/i.test(src)) {
            node = doc.createElement('a');
            node.setAttribute('href', src);
            node.textContent = alt || src.slice(0, 70);
          } else if (mode === 'link') {
            node = doc.createTextNode(`[image${alt ? ': ' + alt : ''}]`);
          } else {
            node = doc.createElement('img');
            node.setAttribute('src', resolved);
            if (alt) node.setAttribute('alt', alt);
          }
        } else if (tok.startsWith('`')) {
          node = doc.createElement('code'); node.textContent = tok.slice(1, -1);
        } else if (tok.startsWith('**')) {
          node = doc.createElement('strong'); node.textContent = tok.slice(2, -2);
        } else if (tok.startsWith('~~')) {
          node = doc.createElement('del'); node.textContent = tok.slice(2, -2);
        } else if (tok.startsWith('[')) {
          const cut = tok.lastIndexOf('](');
          const label = tok.slice(1, cut);
          const href = tok.slice(cut + 2, -1);
          if (/^(https?:|mailto:)/i.test(href)) {
            node = doc.createElement('a');
            node.setAttribute('href', href);
            node.textContent = label;
          } else {
            node = doc.createTextNode(label);
          }
        } else {
          node = doc.createElement('em'); node.textContent = tok.slice(1, -1);
        }
        parent.appendChild(node);
        last = m.index + tok.length;
      }
      if (last < line.length) parent.appendChild(doc.createTextNode(line.slice(last)));
    });
  }

  function mdToDom(md, doc, ctx) {
    const frag = doc.createDocumentFragment();
    const lines = String(md).split('\n');
    const fenceLen = l => { const m = /^\s*(`{3,})/.exec(l); return m ? m[1].length : 0; };
    const isFence = l => fenceLen(l) > 0;
    const isHead = l => /^#{1,6}\s+/.test(l);
    const isQuote = l => /^\s*>/.test(l);
    const isRule = l => /^\s*(---|\*\*\*|___)\s*$/.test(l);
    const isItem = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
    const isRow = l => /^\s*\|.*\|\s*$/.test(l);

    let i = 0;
    while (i < lines.length) {
      const l = lines[i];

      if (isFence(l)) {
        const open = fenceLen(l);
        const lang = l.replace(/^\s*`+/, '').trim();
        const buf = []; i++;
        while (i < lines.length && !(fenceLen(lines[i]) >= open && !lines[i].replace(/^\s*`+/, '').trim())) {
          buf.push(lines[i++]);
        }
        i++;
        const pre = doc.createElement('pre');
        const code = doc.createElement('code');
        if (lang) code.className = 'language-' + lang.replace(/[^\w+#.-]/g, '');
        code.textContent = buf.join('\n');
        pre.appendChild(code);
        frag.appendChild(pre);
        continue;
      }
      if (!l.trim()) { i++; continue; }
      if (isRule(l)) { frag.appendChild(doc.createElement('hr')); i++; continue; }
      if (isHead(l)) {
        const m = /^(#{1,6})\s+(.*)$/.exec(l);
        const h = doc.createElement('h' + m[1].length);
        appendInline(h, m[2], doc, ctx);
        frag.appendChild(h); i++; continue;
      }
      if (isQuote(l)) {
        const buf = [];
        while (i < lines.length && isQuote(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        const bq = doc.createElement('blockquote');
        bq.appendChild(mdToDom(buf.join('\n'), doc, ctx));
        frag.appendChild(bq); continue;
      }
      if (isRow(l)) {
        const buf = [];
        while (i < lines.length && isRow(lines[i])) buf.push(lines[i++]);
        const rows = buf
          .filter(r => !/^\s*\|[\s|:-]+\|\s*$/.test(r))
          .map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
        const table = doc.createElement('table');
        rows.forEach((cells, ri) => {
          const tr = doc.createElement('tr');
          cells.forEach(c => {
            const cell = doc.createElement(ri === 0 ? 'th' : 'td');
            appendInline(cell, c, doc, ctx);
            tr.appendChild(cell);
          });
          table.appendChild(tr);
        });
        frag.appendChild(table); continue;
      }
      if (isItem(l)) {
        const buf = [];
        while (i < lines.length && (isItem(lines[i]) || /^\s{2,}\S/.test(lines[i]))) buf.push(lines[i++]);
        frag.appendChild(buildList(buf, doc, ctx));
        continue;
      }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isFence(lines[i]) && !isHead(lines[i])
             && !isQuote(lines[i]) && !isItem(lines[i]) && !isRule(lines[i]) && !isRow(lines[i])) {
        buf.push(lines[i++]);
      }
      const p = doc.createElement('p');
      appendInline(p, buf.join('\n'), doc, ctx);
      frag.appendChild(p);
    }
    return frag;
  }

  function buildList(lines, doc, ctx) {
    const baseIndent = lines.reduce((min, l) => {
      const m = /^(\s*)([-*+]|\d+[.)])\s+/.exec(l);
      return m ? Math.min(min, m[1].length) : min;
    }, 99);
    const ordered = /^\s*\d+[.)]\s+/.test(lines.find(l => /^\s*([-*+]|\d+[.)])\s+/.test(l)) || '');
    const list = doc.createElement(ordered ? 'ol' : 'ul');
    let current = null, nested = [];

    const closeNested = () => {
      if (current && nested.length) {
        current.appendChild(buildList(nested, doc, ctx));
        nested = [];
      }
    };

    for (const line of lines) {
      const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (m && m[1].length <= baseIndent + 1) {
        closeNested();
        current = doc.createElement('li');
        appendInline(current, m[3], doc, ctx);
        list.appendChild(current);
      } else if (current) {
        nested.push(line);
      }
    }
    closeNested();
    return list;
  }

  const PRINT_CSS = `
@page { margin: 18mm 16mm; }
:root { color-scheme: light; }
body { margin:0; padding:0 0 24px; background:#fff; color:#16181d;
  font:15px/1.65 "Iowan Old Style","Charter",Georgia,"Times New Roman",serif; }
.wrap { max-width: 44em; margin: 0 auto; padding: 8mm 0; }
h1 { font-size:26px; line-height:1.25; margin:0 0 4px; }
h2 { font-size:15px; letter-spacing:.02em; margin:26px 0 8px; padding-bottom:4px;
  border-bottom:1px solid #d9dce2; font-family:ui-sans-serif,system-ui,sans-serif; }
h3,h4,h5,h6 { font-size:14px; margin:18px 0 6px; font-family:ui-sans-serif,system-ui,sans-serif; }
p { margin:0 0 10px; }
strong { font-weight:650; }
code { font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  background:#f1f2f5; padding:1px 4px; border-radius:3px; }
pre { background:#f7f8fa; border:1px solid #e3e6ec; border-left:3px solid #b9bdc7;
  padding:10px 12px; overflow-x:auto; break-inside:avoid; page-break-inside:avoid; }
pre code { background:none; padding:0; font-size:12px; }
blockquote { margin:10px 0; padding:2px 0 2px 14px; border-left:3px solid #ccd0d8; color:#4a4f59; }
table { border-collapse:collapse; width:100%; margin:10px 0; font-size:13.5px; break-inside:avoid; }
th,td { border:1px solid #dfe2e8; padding:5px 8px; text-align:left; vertical-align:top; }
th { background:#f3f4f7; }
hr { border:0; border-top:1px solid #e1e4ea; margin:20px 0; }
img { max-width:100%; height:auto; display:block; margin:10px 0; break-inside:avoid; }
figure { margin:12px 0; break-inside:avoid; page-break-inside:avoid; }
figcaption { font:11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; color:#6b7180; margin-top:4px; }
.appendix { margin-top:26px; padding-top:10px; border-top:2px solid #d9dce2; }
a { color:#1a4fa0; text-decoration:none; border-bottom:1px solid #c3d2ea; }
ul,ol { margin:0 0 10px; padding-left:22px; }
li { margin:2px 0; }
.meta { font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; color:#6b7180;
  margin:0 0 18px; word-break:break-all; }
`;

  function buildPrintDoc(doc, md, imgMap) {
    const ctx = { imgMap: imgMap || new Map(), images: state.opts.images, appendix: [] };
    const wrap = doc.createElement('div');
    wrap.className = 'wrap';
    wrap.appendChild(mdToDom(md, doc, ctx));

    if (ctx.appendix.length) {
      const sec = doc.createElement('div');
      sec.className = 'appendix';
      const h2 = doc.createElement('h2');
      h2.textContent = `Images (${ctx.appendix.length})`;
      sec.appendChild(h2);
      ctx.appendix.forEach((im, i) => {
        const fig = doc.createElement('figure');
        const img = doc.createElement('img');
        img.setAttribute('src', im.src);
        if (im.alt) img.setAttribute('alt', im.alt);
        const cap = doc.createElement('figcaption');
        cap.textContent = `image ${i + 1}${im.alt ? ' — ' + im.alt : ''}`;
        fig.appendChild(img);
        fig.appendChild(cap);
        sec.appendChild(fig);
      });
      wrap.appendChild(sec);
    }
    return wrap;
  }

  const safeName = () =>
    (chatTitle().replace(/[^\w\- ]+/g, '_').replace(/\s+/g, '-').slice(0, 72) || 'conversation')
    + '-' + new Date().toISOString().slice(0, 10);

  const MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
  };

  function dataUrlBytes(url) {
    const comma = url.indexOf(',');
    const meta = url.slice(5, comma);
    const mime = meta.split(';')[0] || 'application/octet-stream';
    const body = url.slice(comma + 1);
    if (/;base64/i.test(meta)) {
      const bin = atob(body);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return { bytes: out, mime };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(body)), mime };
  }

  let CRC_TABLE = null;
  function crc32(u8) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        CRC_TABLE[n] = c;
      }
    }
    let c = -1;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function zipBlob(entries) {
    const enc = new TextEncoder();
    const body = [];
    const central = [];
    let off = 0;
    const d = new Date();
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;

    for (const e of entries) {
      const name = enc.encode(e.name);
      const data = e.data;
      const crc = crc32(data);
      const lh = new Uint8Array(30);
      const v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint16(8, 0, true); v.setUint16(10, time, true); v.setUint16(12, date, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
      body.push(lh, name, data);

      const ch = new Uint8Array(46);
      const c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true);
      c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true);
      c.setUint32(42, off, true);
      central.push(ch, name);
      off += 30 + name.length + data.length;
    }

    const cdSize = central.reduce((a, x) => a + x.length, 0);
    const eo = new Uint8Array(22);
    const z = new DataView(eo.buffer);
    z.setUint32(0, 0x06054b50, true);
    z.setUint16(8, entries.length, true); z.setUint16(10, entries.length, true);
    z.setUint32(12, cdSize, true); z.setUint32(16, off, true);
    return new Blob([...body, ...central, eo], { type: 'application/zip' });
  }

  const withExt = (name, ext) =>
    (!ext || /\.[a-z0-9]{1,5}$/i.test(String(name))) ? String(name) : `${name}.${ext}`;

  const safeFileName = n => String(n || 'file')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';

  function sourceFromEl(el) {
    if (!el || !el.querySelector) return null;
    const cand = el.tagName === 'IMG' ? el
      : el.querySelector('a[href], img[src], source[src], [data-src]');
    if (!cand) return null;
    const raw = cand.getAttribute('href') || cand.currentSrc
      || cand.getAttribute('src') || cand.getAttribute('data-src') || '';
    return /^(https?:|blob:|data:)/i.test(raw) ? raw : null;
  }

  async function collectFiles(md, status) {
    const entries = [];
    const missing = [];
    const taken = new Set();
    let n = 0;
    const put = (name, data, mime) => {
      if (!data || !data.length) return false;
      let out = `${String(++n).padStart(2, '0')}-${safeFileName(name)}`;
      while (taken.has(out)) out = `${String(++n).padStart(2, '0')}-${safeFileName(name)}`;
      taken.add(out);
      entries.push({ name: out, data, mime: mime || 'application/octet-stream' });
      return true;
    };

    const altFor = new Map();
    for (const m of String(md).matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
      if (m[1] && !altFor.has(m[2])) altFor.set(m[2], m[1]);
    }
    const imgMap = await resolveImages(md, 'inline', status);
    for (const [url, dataUrl] of imgMap) {
      let bytes, mime;
      try { ({ bytes, mime } = dataUrlBytes(dataUrl)); } catch { continue; }
      const fromUrl = (/([^/?#]+\.(?:png|jpe?g|gif|webp|avif|bmp))(?:$|[?#])/i.exec(url) || [])[1];
      const base = altFor.get(url) || fromUrl || 'image';
      put(withExt(base, MIME_EXT[mime] || 'bin'), bytes, mime);
    }

    const enc = new TextEncoder();
    for (const p of selectedParts()) {
      if (p.kind !== 'attachment' && p.kind !== 'artifact') continue;
      if (p.kind === 'artifact' && !p.fileText && !p.fileUrl) continue;
      const label = p.fileName
        || (p.md.split('\n')[0] || '').replace(/^File:\s*/i, '').trim()
        || 'attachment';
      const url = p.fileUrl || sourceFromEl(p.el);
      if (url) {
        if (status) status(`Fetching ${label}…`);
        try {
          let sameOrigin = false;
          try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch {  }
          if (/^data:/i.test(url)) {
            const { bytes, mime } = dataUrlBytes(url);
            if (put(label, bytes, mime)) continue;
          } else {
            const r = await fetch(url, { credentials: (sameOrigin || /^blob:/i.test(url)) ? 'include' : 'omit' });
            if (r.ok) {
              const blob = await r.blob();
              const buf = new Uint8Array(await blob.arrayBuffer());
              if (put(withExt(label, MIME_EXT[blob.type] || ''), buf, blob.type)) continue;
            }
          }
        } catch (e) { console.debug('[chat-export] attachment unavailable', label, e); }
      }
      if (p.fileText) {
        if (put(withExt(label, 'txt'), enc.encode(p.fileText), 'text/plain')) continue;
      }
      missing.push(label);
    }

    return { entries, missing };
  }

  function downloadBlob(blob, ext) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeName()}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function download(text, ext, mime) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safeName()}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportPdf(md, imgMap) {
    if (state.opts.pdfViaFile) return exportPrintableFile(md, imgMap);
    const w = window.open('', '_blank');
    if (!w) { toast('Popup blocked — saving a printable file instead'); return exportPrintableFile(md); }
    try {
      const d = w.document;
      d.title = safeName();
      const style = d.createElement('style');
      style.textContent = PRINT_CSS;
      d.head.appendChild(style);
      const meta = d.createElement('meta');
      meta.setAttribute('charset', 'utf-8');
      d.head.appendChild(meta);
      d.body.appendChild(buildPrintDoc(d, md, imgMap));
      setTimeout(() => { try { w.focus(); w.print(); } catch {  } }, 350);
    } catch (e) {
      console.warn('[chat-export] print window blocked by host policy:', e);
      try { w.close(); } catch {}
      toast('Host page policy blocked the print window — saved a file instead');
      exportPrintableFile(md, imgMap);
    }
  }

  function printableHtml(md, imgMap) {
    const d = document.implementation.createHTMLDocument(safeName());
    const meta = d.createElement('meta'); meta.setAttribute('charset', 'utf-8');
    d.head.appendChild(meta);
    const style = d.createElement('style'); style.textContent = PRINT_CSS;
    d.head.appendChild(style);
    d.body.appendChild(buildPrintDoc(d, md, imgMap));
    return '<!doctype html>\n' + d.documentElement.outerHTML;
  }

  function exportPrintableFile(md, imgMap) {
    download(printableHtml(md, imgMap), 'html', 'text/html');
    toast('Saved .html — open it and print to PDF');
  }

  const state = {
    messages: [],
    sel: new Set(),
    query: '',
    openGroups: new Set(),
    fold: new Map(),
    foldX: new Map(),
    jumpAt: {},
    source: 'dom',
    apiTried: false,
    apiTitle: null,
    loadedKey: null,
    opts: {
      frontMatter: true,
      roleHeadings: true,
      numbering: true,
      partLabels: true,
      quoteThinking: true,
      fenceTool: true,
      separators: true,
      metaLine: true,
      pdfViaFile: false,
      viewSource: true,
      viewRendered: false,
      images: 'inline',
    },
  };

  const allParts = () => state.messages.flatMap(m => m.parts);

  const CONV_SEGMENTS = adapter.id === 'chatgpt'
    ? ['c', 'share', 'g']
    : ['chat', 'share', 'conversation', 'conversations'];

  const currentConvKey = () =>
    idFromUrl(CONV_SEGMENTS) || idFromDom(CONV_SEGMENTS) || location.pathname;

  function conversationChanged() {
    const key = currentConvKey();
    if (!state.loadedKey) { state.loadedKey = key; return false; }
    if (key === state.loadedKey) return false;

    loadToken++;
    state.messages = [];
    state.sel = new Set();
    state.fold = new Map();
    state.foldX = new Map();
    state.openGroups = new Set();
    state.jumpAt = {};
    state.query = '';
    state.source = 'dom';
    state.apiTried = false;
    state.apiTitle = null;
    state.convId = null;
    state.loadedKey = key;
    return true;
  }

  let loadToken = 0;
  const selectedParts = () => allParts().filter(p => state.sel.has(p.id));

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.launch {
  position: fixed; right: 18px; bottom: 18px; pointer-events: auto;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px; border: 1px solid #3a3f4b; border-radius: 6px;
  background: #1b1e24; color: #e8eaee; font-size: 13px; font-weight: 500;
  cursor: pointer; box-shadow: 0 6px 22px rgba(0,0,0,.35);
}
.launch:hover { background: #22262e; border-color: #4a5160; }
.launch:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid #f0b429; outline-offset: 2px; }
.launch .dot { width: 7px; height: 7px; border-radius: 50%; background: #f0b429; }

.scrim { position: fixed; inset: 0; background: rgba(8,9,12,.62); pointer-events: auto;
  display: grid; place-items: center; padding: 24px; }
.panel { width: min(920px, 100%); max-height: min(86vh, 860px); display: flex; flex-direction: column;
  background: #15171c; color: #e8eaee; border: 1px solid #2c313a; border-radius: 10px;
  box-shadow: 0 24px 70px rgba(0,0,0,.55); overflow: hidden; }

header { display: flex; align-items: baseline; gap: 12px; padding: 16px 18px 12px; }
header h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .01em; }
header .by { font-size: 10.5px; color: #ffffff; white-space: nowrap; text-decoration: none; }
header .by:hover { text-decoration: underline; }
header .src { font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #7d8494;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
header .x { margin-left: auto; background: none; border: 0; color: #8b92a2; font-size: 18px;
  cursor: pointer; line-height: 1; padding: 2px 6px; border-radius: 4px; }
header .x:hover { color: #e8eaee; background: #22262e; }

.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  padding: 0 18px 12px; border-bottom: 1px solid #262b33; }
.bar .sep { width: 1px; height: 18px; background: #2c313a; margin: 0 4px; }
.bar .inc { font-size: 11.5px; color: #7d8494; margin-right: 2px; }
.idrow { display: inline-flex; gap: 6px; align-items: center; flex: 1; min-width: 200px; }
.idrow[hidden] { display: none; }
button.act { background: #1e222a; border: 1px solid #333945; color: #cfd4de; border-radius: 5px;
  padding: 5px 10px; font-size: 12px; cursor: pointer; }
button.act:hover { background: #262b34; color: #fff; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 999px;
  border: 1px solid #333945; background: #1b1f26; color: #aeb5c2; font-size: 11.5px; cursor: pointer; }
.chip:hover { border-color: #4a5160; color: #e8eaee; }
.chip.on { border-color: #6a5320; background: #2a2314; color: #f0c766; }
.chip .n { font: 11px ui-monospace, Menlo, monospace; opacity: .75; }
.gchip { display: inline-flex; align-items: stretch; border: 1px solid #333945;
  border-radius: 6px; overflow: hidden; background: #1b1f26; }
.gchip.some { border-color: #4c4a36; }
.gchip.all { border-color: #6a5320; }
.gchip button { background: none; border: 0; color: #aeb5c2; cursor: pointer; font-size: 11.5px;
  padding: 4px 8px; display: inline-flex; align-items: center; gap: 6px; }
.gchip button:hover { background: #262b34; color: #fff; }
.gchip .gtick { font-size: 13px; padding: 4px 7px; border-right: 1px solid #2c313a; }
.gchip.all .gtick, .gchip.all .glabel { color: #f0c766; }
.gchip.some .gtick { color: #d3c07a; }
.gchip .gjump { border-left: 1px solid #2c313a; color: #8b92a2; }
.gchip .caret { font: 11px ui-monospace, Menlo, monospace; opacity: .6; }
.subchips { display: inline-flex; gap: 6px; padding: 0 4px; }
.part.flash { background: #2a2314; box-shadow: inset 2px 0 0 #f0b429; }
.search { flex: 1; min-width: 140px; background: #101216; border: 1px solid #2c313a; color: #e8eaee;
  border-radius: 5px; padding: 5px 9px; font-size: 12px; }
.search::placeholder { color: #666d7c; }

.list { overflow-y: auto; flex: 1; padding: 6px 0 10px; }
.exch { border-left: 3px solid transparent; }
.exch.any { border-left-color: #f0b429; }
.exch + .exch { border-top: 1px solid #272c34; }
.xhead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 7px 18px 7px 12px; background: #191d24; border-bottom: 1px solid #21262e; }
.xhead button { background: none; border: 0; cursor: pointer; color: #8a91a0; font-size: 11px;
  display: inline-flex; align-items: center; gap: 5px; padding: 2px 6px; border-radius: 4px; }
.xhead button:hover { background: #242a33; color: #e8eaee; }
.xhead .xt { font-size: 13px; }
.xhead.all .xt { color: #f0b429; }
.xhead.some .xt { color: #d3c07a; }
.xhead .xnum { font: 600 12px ui-monospace, Menlo, monospace; color: #cfd4de; }
.xhead .caret { font-size: 9px; opacity: .75; }
.xacts { display: inline-flex; gap: 2px; margin-left: 2px; }
.xa { border: 1px solid #2f3540 !important; color: #99a0ad !important; font-size: 10.5px !important; }
.xa:hover { border-color: #4a5160 !important; }
.xgroups { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.xg { border: 1px solid #2c313a !important; border-radius: 4px !important; font-size: 10.5px !important; }
.xg.all { border-color: #5c4a20 !important; background: #221d12 !important; color: #e0b567 !important; }
.xg.some { border-color: #46412f !important; color: #c7b47c !important; }
.xg .n { font: 10px ui-monospace, Menlo, monospace; opacity: .7; }
.xsum { margin-left: auto; font: 11px ui-monospace, Menlo, monospace; color: #616875; white-space: nowrap; }
.xbody { padding: 2px 0 6px; }
.msg { padding: 6px 18px 6px 16px; }
.msg + .msg { border-top: 1px solid #1f232a; }
.mhead { display: flex; align-items: center; gap: 9px; }
.mhead label { display: flex; align-items: center; gap: 9px; cursor: pointer; flex: 1; min-width: 0; }
.idx { font: 11px ui-monospace, Menlo, monospace; color: #6b7280; width: 2.2em; text-align: right; }
.who { font-size: 12.5px; font-weight: 600; }
.who.user { color: #93b7f0; }
.who.assistant { color: #d6d9e0; }
.mchars { margin-left: auto; font: 11px ui-monospace, Menlo, monospace; color: #616875; }

.ghead { display: flex; align-items: center; gap: 2px; margin: 5px 0 1px; }
.ghead button { background: none; border: 0; cursor: pointer; color: #8a91a0; font-size: 11px;
  display: inline-flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 4px; }
.ghead button:hover { background: #1f242c; color: #e8eaee; }
.ghead .gt { font-size: 12px; }
.ghead .gname { letter-spacing: .02em; }
.ghead.all .gt, .ghead.all .gname { color: #e0b567; }
.ghead.some .gt, .ghead.some .gname { color: #c7b47c; }
.ghead .caret { font-size: 9px; opacity: .8; width: .8em; }
.ghead .n, .ghead .gch { font: 10.5px ui-monospace, Menlo, monospace; opacity: .65; }
.grows { display: flex; flex-direction: column; gap: 3px; padding-left: 14px;
  border-left: 1px solid #23272f; margin-left: 9px; }
.parts { margin: 6px 0 0 calc(2.2em + 9px); display: flex; flex-direction: column; gap: 3px; }
.part { display: flex; gap: 8px; align-items: flex-start; padding: 3px 6px; border-radius: 4px; cursor: pointer; }
.part:hover { background: #1b1f26; }
.part input { margin-top: 3px; }
.kind { flex: none; font-size: 10.5px; padding: 1px 6px; border-radius: 3px; border: 1px solid #333945;
  color: #98a0ae; background: #191d24; min-width: 62px; text-align: center; white-space: nowrap; }
.kind.image { color: #8fbf9f; border-color: #33543d; }
.kind.render { color: #9fb0d8; border-color: #3a4566; }
.kind.thinking { color: #b79ae8; border-color: #4a3a6b; }
.kind.tool { color: #7fc4a8; border-color: #2f5a49; }
.kind.code { color: #e0b070; border-color: #5c4527; }
.kind.artifact { color: #78b6df; border-color: #2c4d66; }
.kind.attachment { color: #c98fa8; border-color: #5e3547; }
.view { flex: none; font-size: 10.5px; padding: 1px 6px; border-radius: 3px;
  border: 1px solid #38455c; background: #171d26; color: #8fa8c8; cursor: help; }
.warn { flex: none; font-size: 10.5px; padding: 1px 6px; border-radius: 3px;
  border: 1px solid #6b4a1f; background: #2a2011; color: #e8b45c; cursor: help; }
.prev { font: 11.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #8a91a0;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  white-space: pre-wrap; word-break: break-word; }
.part.open .prev { -webkit-line-clamp: 12; color: #b6bdc9; }
.part input:checked ~ .prev { color: #c9cfda; }

.empty { padding: 34px 18px; text-align: center; color: #7d8494; font-size: 13px; }
.empty code { font-family: ui-monospace, Menlo, monospace; color: #f0c766; }

footer { border-top: 1px solid #262b33; padding: 12px 18px 14px; background: #13151a; }
.opts { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-bottom: 12px; }
.opts label { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #98a0ae; cursor: pointer; }
.opts label:hover { color: #d6d9e0; }
.pick { background: #101216; border: 1px solid #2c313a; color: #cfd4de; border-radius: 4px;
  padding: 2px 4px; font-size: 11.5px; margin-left: 2px; }
.go { display: flex; align-items: center; gap: 8px; }
.count { font: 11.5px ui-monospace, Menlo, monospace; color: #7d8494; margin-right: auto; }
button.primary { background: #f0b429; border: 1px solid #f0b429; color: #191307; font-weight: 600;
  border-radius: 5px; padding: 7px 14px; font-size: 12.5px; cursor: pointer; }
button.primary:hover { background: #ffc44a; }
button.primary:disabled { opacity: .4; cursor: not-allowed; }
.toasts { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
  display: flex; flex-direction: column-reverse; gap: 6px; align-items: center; pointer-events: none; }
.toast { background: #22262e; color: #e8eaee; border: 1px solid #3a4150; border-radius: 6px;
  padding: 8px 14px; font-size: 12.5px; max-width: 70vw; text-align: center;
  box-shadow: 0 8px 26px rgba(0,0,0,.45); }
.act.load { border-color: #6a5320; background: #2a2314; color: #f0c766; font-weight: 600; }
.act.load:hover { background: #33290f; color: #ffd37a; }
@media (prefers-reduced-motion: no-preference) { .panel { animation: pop .12s ease-out; } }
@keyframes pop { from { transform: translateY(6px); opacity: 0 } to { transform: none; opacity: 1 } }
`;

  const h = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'checked' || k === 'type' || k === 'value' || k === 'placeholder' || k === 'title' || k === 'disabled') n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid);
    return n;
  };

  const host = h('div', { id: 'chat-exporter-host' });
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483000';
  host.style.pointerEvents = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    shadow.appendChild(h('style', { text: CSS }));
  }
  document.documentElement.appendChild(host);

  let guardedInput = null;

  for (const type of ['keydown', 'keypress', 'keyup', 'input', 'beforeinput',
                      'paste', 'cut', 'compositionstart', 'compositionupdate', 'compositionend']) {
    host.addEventListener(type, e => {
      if (type === 'keydown' && e.key === 'Escape' && scrim) { close(); e.preventDefault(); }
      e.stopPropagation();
    });
  }
  shadow.addEventListener('focusin', e => {
    guardedInput = (e.target && e.target.tagName === 'INPUT') ? e.target : null;
  });
  document.addEventListener('focusin', e => {
    if (!scrim || !guardedInput) return;
    if (host.contains(e.target)) return;
    const want = guardedInput;
    setTimeout(() => { if (scrim && want.isConnected) want.focus(); }, 0);
  }, true);

  const launch = h('button', { class: 'launch', title: 'Export this conversation', onclick: () => open() },
    h('span', { class: 'dot' }), 'Export chat');
  shadow.appendChild(launch);

  let scrim = null;

  let toastHost = null;
  const toasts = () => {
    if (!toastHost || !toastHost.isConnected) {
      toastHost = h('div', { class: 'toasts' });
      shadow.appendChild(toastHost);
    }
    return toastHost;
  };

  function toast(msg) {
    const t = h('div', { class: 'toast', text: msg });
    toasts().appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function sticky(msg) {
    const t = h('div', { class: 'toast', text: msg });
    toasts().appendChild(t);
    return m => { if (m == null) t.remove(); else t.textContent = m; };
  }

  let refs = {};

  function open() {
    if (scrim) close();
    const moved = conversationChanged();
    if (state.source === 'dom') rescan(!moved && state.messages.length > 0);
    scrim = h('div', { class: 'scrim', onclick: e => { if (e.target === scrim) close(); } }, buildPanel());
    shadow.appendChild(scrim);
    document.addEventListener('keydown', onKey, true);
    renderList();
    renderChips();
    updateTotals();
    updateSource();
    if (moved) toast('Different conversation — loading it');
    if (apiLoader && !state.apiTried) loadApi(false);
  }

  function close() {
    guardedInput = null;
    if (scrim) { scrim.remove(); scrim = null; }
    document.removeEventListener('keydown', onKey, true);
  }

  const onKey = e => { if (e.key === 'Escape' && scrim) { e.stopPropagation(); close(); } };

  function buildPanel() {
    refs = {};
    refs.list = h('div', { class: 'list' });
    refs.chips = h('div', { class: 'bar' });
    refs.count = h('span', { class: 'count' });

    const bulk = h('div', { class: 'bar' },
      refs.load = h('button', {
        class: 'act load', text: 'Load everything',
        title: 'Get the most complete version available: the full transcript from '
             + location.host + ' if it can be read, otherwise a page sweep with every '
             + 'artifact panel opened. Escalates only as far as it needs to.',
        onclick: () => loadEverything(),
      }),
      h('span', { class: 'sep' }),
      h('button', { class: 'act', text: 'Select all', onclick: () => setAll(true) }),
      h('button', { class: 'act', text: 'Select none', onclick: () => setAll(false) }),
      h('button', { class: 'act', text: 'Invert', onclick: invert }),
      h('span', { class: 'sep' }),
      refs.search = h('input', {
        class: 'search', type: 'search', placeholder: 'Filter messages by text…',
        oninput: e => { state.query = e.target.value.toLowerCase(); renderList(); },
      }),
      apiLoader ? (refs.idRow = h('span', { class: 'idrow', hidden: true },
        refs.idInput = h('input', {
          class: 'search', type: 'text', placeholder: 'paste this conversation\u2019s URL\u2026',
          onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); submitId(); } },
        }),
        h('button', { class: 'act', text: 'Use this', onclick: submitId }),
      )) : null,
    );

    const opt = (key, label, title) => h('label', { title: title || '' },
      h('input', {
        type: 'checkbox', checked: state.opts[key],
        onchange: e => { state.opts[key] = e.target.checked; updateTotals(); },
      }), label);

    const choice = (key, label, pairs, title) => {
      const sel = h('select', {
        class: 'pick', title: title || '',
        onchange: e => { state.opts[key] = e.target.value; updateTotals(); },
      }, pairs.map(([v, t]) => h('option', { value: v, text: t })));
      sel.value = state.opts[key];
      return h('label', { title: title || '' }, label, sel);
    };

    const footer = h('footer', {},
      h('div', { class: 'opts' },
        opt('frontMatter', 'Title & source header'),
        opt('roleHeadings', 'Role headings'),
        opt('numbering', 'Number messages'),
        opt('partLabels', 'Label thinking / tool sections'),
        opt('quoteThinking', 'Thinking as blockquote'),
        opt('fenceTool', 'Tool output in code fence'),
        opt('separators', 'Rule between messages'),
        opt('metaLine', 'Timestamp & model in heading'),
        opt('viewSource', 'Artifacts: source view',
          'For an artifact with both a source and a rendered view, capture the source'),
        opt('viewRendered', 'Artifacts: rendered view',
          'Also capture the rendered/preview view as a separate, separately selectable part'),
        choice('images', 'Images in PDF', [
          ['inline', 'inline'], ['appendix', 'collected at the end'],
          ['link', 'links only'], ['omit', 'omit'],
        ], 'Images are embedded as data URLs so the document stands alone'),
        opt('pdfViaFile', 'PDF: save printable file instead of opening print window',
          'Use this if the page\u2019s security policy blocks the print window'),
      ),
      h('div', { class: 'go' },
        refs.count,
        h('button', { class: 'act', text: 'Copy Markdown', onclick: doCopy }),
        h('button', { class: 'act', text: 'Text', onclick: () => doExport('txt') }),
        h('button', { class: 'act', text: 'JSON', onclick: () => doExport('json') }),
        h('button', {
          class: 'act', text: 'ZIP', onclick: () => doExport('zip'),
          title: 'Download the files in the selection — images and attachments — as one archive. '
               + 'Files only; the conversation itself comes from the other buttons.',
        }),
        h('button', { class: 'act', text: 'PDF', onclick: () => doExport('pdf') }),
        refs.md = h('button', { class: 'primary', text: 'Save Markdown', onclick: () => doExport('md') }),
      ),
    );

    return h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Export conversation' },
      h('header', {},
        h('h2', { text: 'Export conversation' }),
        h('a', {
          class: 'by', text: '\u00a9 Erez Kalman',
          href: 'https://www.kalman.co.il/',
          target: '_blank',
          rel: 'noopener noreferrer',
          title: 'kalman.co.il',
        }),
        refs.src = h('span', { class: 'src' }),
        h('button', { class: 'x', text: '\u00d7', title: 'Close (Esc)', onclick: close }),
      ),
      bulk,
      refs.chips,
      refs.list,
      footer,
    );
  }

  function renderChips() {
    refs.chips.replaceChildren();
    const parts = allParts();
    if (!parts.length) return;

    const glyph = (on, total) => (on === 0 ? '\u25a1' : on === total ? '\u2611' : '\u25a3');

    for (const g of GROUPS) {
      const mine = parts.filter(p => g.kinds.includes(p.kind));
      if (!mine.length) continue;
      const on = mine.filter(p => state.sel.has(p.id)).length;
      const open = state.openGroups.has(g.id);

      const chip = h('span', { class: 'gchip' + (on ? (on === mine.length ? ' all' : ' some') : '') },
        h('button', {
          class: 'gtick', text: glyph(on, mine.length),
          title: on === mine.length ? `Deselect all ${mine.length} ${g.label.toLowerCase()} parts`
            : `Select all ${mine.length} ${g.label.toLowerCase()} parts`,
          onclick: () => {
            const want = on !== mine.length;
            mine.forEach(p => want ? state.sel.add(p.id) : state.sel.delete(p.id));
            renderList(); renderChips(); updateTotals();
          },
        }),
        h('button', {
          class: 'glabel', title: 'Show the kinds in this group',
          onclick: () => {
            if (open) state.openGroups.delete(g.id); else state.openGroups.add(g.id);
            renderChips();
          },
        }, g.label, h('span', { class: 'n', text: `${on}/${mine.length}` }),
           h('span', { class: 'caret', text: open ? '\u2212' : '+' })),
        h('button', {
          class: 'gjump', text: '\u2192',
          title: `Jump to the next ${g.label.toLowerCase()} part`,
          onclick: () => jumpTo(g.id),
        }),
      );
      refs.chips.appendChild(chip);

      if (open) {
        const sub = h('span', { class: 'subchips' });
        for (const k of g.kinds) {
          const kp = mine.filter(p => p.kind === k);
          if (!kp.length) continue;
          const kon = kp.filter(p => state.sel.has(p.id)).length;
          sub.appendChild(h('button', {
            class: 'chip' + (kon ? ' on' : ''),
            title: kon === kp.length ? `Remove all ${kindOf(k).label.toLowerCase()} parts`
              : `Add all ${kindOf(k).label.toLowerCase()} parts`,
            onclick: () => {
              const want = kon !== kp.length;
              kp.forEach(p => want ? state.sel.add(p.id) : state.sel.delete(p.id));
              renderList(); renderChips(); updateTotals();
            },
          }, kindOf(k).label, h('span', { class: 'n', text: `${kon}/${kp.length}` })));
        }
        if (sub.childNodes.length) refs.chips.appendChild(sub);
      }
    }
  }

  function jumpTo(groupId) {
    const rows = [...refs.list.querySelectorAll(`.part[data-group="${groupId}"]`)];
    if (!rows.length) { toast('Nothing in that group is currently shown'); return; }
    const at = (state.jumpAt[groupId] || 0) % rows.length;
    state.jumpAt[groupId] = at + 1;
    const row = rows[at];
    const msg = row.closest('.msg');
    (msg || row).scrollIntoView({ block: 'center' });
    refs.list.querySelectorAll('.flash').forEach(e => e.classList.remove('flash'));
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1400);
    toast(`${GROUPS.find(g => g.id === groupId).label} ${at + 1} of ${rows.length}`);
  }

  function exchangesOf(messages) {
    const out = [];
    for (const m of messages) {
      if (m.role === 'user' || !out.length) {
        out.push({ id: 'x' + out.length, index: out.length + 1, messages: [] });
      }
      out[out.length - 1].messages.push(m);
    }
    return out;
  }

  const glyphFor = (on, total) => (on === 0 ? '\u25a1' : on === total ? '\u2611' : '\u25a3');
  const redraw = () => { renderList(); renderChips(); updateTotals(); };
  const applySel = (parts, want) => {
    parts.forEach(p => want ? state.sel.add(p.id) : state.sel.delete(p.id));
    redraw();
  };

  function groupTick(parts, g, cls) {
    const mine = parts.filter(p => g.kinds.includes(p.kind));
    if (!mine.length) return null;
    const on = mine.filter(p => state.sel.has(p.id)).length;
    return h('button', {
      class: cls + (on ? (on === mine.length ? ' all' : ' some') : ''),
      title: on === mine.length
        ? `Deselect the ${mine.length} ${g.label.toLowerCase()} part${mine.length === 1 ? '' : 's'} here`
        : `Select the ${mine.length} ${g.label.toLowerCase()} part${mine.length === 1 ? '' : 's'} here`,
      onclick: () => applySel(mine, on !== mine.length),
    },
      h('span', { class: 't', text: glyphFor(on, mine.length) }),
      g.label,
      h('span', { class: 'n', text: `${on}/${mine.length}` }),
    );
  }

  function renderPart(p) {
    const cb = h('input', {
      type: 'checkbox', checked: state.sel.has(p.id),
      onchange: e => { e.target.checked ? state.sel.add(p.id) : state.sel.delete(p.id); redraw(); },
    });
    const row = h('div', {
      class: 'part', 'data-group': groupOf(p.kind), 'data-pid': p.id,
      onclick: e => {
        if (e.target === cb) return;
        e.preventDefault();
        row.classList.toggle('open');
      },
    },
      cb,
      h('span', {
        class: 'kind ' + p.kind,
        text: kindOf(p.kind).short + (p.lang ? '\u00b7' + p.lang : ''),
        title: kindOf(p.kind).label + (p.lang ? ` (${p.lang})` : ''),
      }),
      p.multiView ? h('span', {
        class: 'view', text: p.kind === 'render' ? 'rendered' : 'source',
        title: 'This artifact has both a source and a rendered view; both can be captured.',
      }) : null,
      p.stub ? h('span', {
        class: 'warn', text: 'body not in page',
        title: 'The page only holds this artifact\u2019s title card. Press "Load everything", '
             + 'or open the artifact panel and load again.',
      }) : null,
      p.partial ? h('span', {
        class: 'warn', text: 'partial capture',
        title: 'The panel is virtualised \u2014 only the lines that were on screen were read.',
      }) : null,
      h('span', { class: 'prev', text: p.md.replace(/\n{2,}/g, '\n') }),
    );
    return row;
  }

  function renderMessage(m) {
    const box = h('input', {
      type: 'checkbox',
      onchange: e => applySel(m.parts, e.target.checked),
    });
    const on = m.parts.filter(p => state.sel.has(p.id)).length;
    box.checked = on === m.parts.length && on > 0;
    box.indeterminate = on > 0 && on < m.parts.length;

    const byGroup = new Map();
    for (const p of m.parts) {
      const gid = groupOf(p.kind);
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid).push(p);
    }
    const order = GROUPS.map(g => g.id).filter(id => byGroup.has(id))
      .concat([...byGroup.keys()].filter(id => !GROUPS.some(g => g.id === id)));

    const partsEl = h('div', { class: 'parts' });
    for (const gid of order) {
      const g = GROUPS.find(x => x.id === gid) || { id: gid, label: gid, kinds: [gid] };
      const mine = byGroup.get(gid);
      const gon = mine.filter(p => state.sel.has(p.id)).length;
      const key = `${m.id}:${gid}`;
      const folded = state.fold.has(key) ? state.fold.get(key) : mine.length > 6;

      partsEl.appendChild(h('div', {
        class: 'ghead' + (gon ? (gon === mine.length ? ' all' : ' some') : ''),
      },
        h('button', {
          class: 'gt', text: glyphFor(gon, mine.length),
          title: gon === mine.length
            ? `Deselect the ${mine.length} ${g.label.toLowerCase()} part${mine.length === 1 ? '' : 's'} here`
            : `Select the ${mine.length} ${g.label.toLowerCase()} part${mine.length === 1 ? '' : 's'} here`,
          onclick: () => applySel(mine, gon !== mine.length),
        }),
        h('button', {
          class: 'gname', title: folded ? 'Show these parts' : 'Hide these parts',
          onclick: () => { state.fold.set(key, !folded); renderList(); },
        },
          h('span', { class: 'caret', text: folded ? '\u25b8' : '\u25be' }),
          g.label,
          h('span', { class: 'n', text: `${gon}/${mine.length}` }),
          h('span', { class: 'gch', text: fmtBytes(mine.reduce((a, p) => a + p.chars, 0)) }),
        ),
      ));

      if (!folded) {
        const inner = h('div', { class: 'grows' });
        mine.forEach(p => inner.appendChild(renderPart(p)));
        partsEl.appendChild(inner);
      }
    }

    return h('div', { class: 'msg' + (on ? ' any' : '') },
      h('div', { class: 'mhead' },
        h('label', {}, box,
          h('span', { class: 'idx', text: String(m.index) }),
          h('span', { class: 'who ' + m.role, text: roleName(m) }),
        ),
        h('span', { class: 'mchars', text: `${m.parts.length} part${m.parts.length > 1 ? 's' : ''} · ${fmtBytes(m.parts.reduce((a, p) => a + p.chars, 0))}` }),
      ),
      partsEl,
    );
  }

  function renderList() {
    refs.list.replaceChildren();

    if (!state.messages.length) {
      refs.list.appendChild(h('div', { class: 'empty' },
        'No messages found. Press ', h('code', { text: 'Load everything' }),
        ' — or if this site has no transcript endpoint, scroll the thread and load again.',
      ));
      return;
    }

    const q = state.query;
    let shown = 0;

    for (const ex of exchangesOf(state.messages)) {
      const visible = ex.messages.filter(m => !q || m.parts.some(p => p.md.toLowerCase().includes(q)));
      if (!visible.length) continue;
      shown += visible.length;

      const xparts = ex.messages.flatMap(m => m.parts);
      const xon = xparts.filter(p => state.sel.has(p.id)).length;
      const folded = state.foldX.get(ex.id) === true;

      const head = h('div', { class: 'xhead' + (xon ? (xon === xparts.length ? ' all' : ' some') : '') },
        h('button', {
          class: 'xt', text: glyphFor(xon, xparts.length),
          title: xon === xparts.length ? 'Deselect this whole exchange' : 'Select this whole exchange',
          onclick: () => applySel(xparts, xon !== xparts.length),
        }),
        h('button', {
          class: 'xnum', title: folded ? 'Show this exchange' : 'Hide this exchange',
          onclick: () => { state.foldX.set(ex.id, !folded); renderList(); },
        }, h('span', { class: 'caret', text: folded ? '\u25b8' : '\u25be' }), String(ex.index)),
        h('span', { class: 'xacts' },
          h('button', { class: 'xa', text: 'all', title: 'Select everything in this exchange',
            onclick: () => applySel(xparts, true) }),
          h('button', { class: 'xa', text: 'none', title: 'Deselect everything in this exchange',
            onclick: () => applySel(xparts, false) }),
          h('button', { class: 'xa', text: 'invert', title: 'Invert the selection in this exchange',
            onclick: () => {
              xparts.forEach(p => state.sel.has(p.id) ? state.sel.delete(p.id) : state.sel.add(p.id));
              redraw();
            } }),
        ),
        h('span', { class: 'xgroups' }, GROUPS.map(g => groupTick(xparts, g, 'xg'))),
        h('span', { class: 'xsum', text: `${xparts.length} part${xparts.length === 1 ? '' : 's'} · ${fmtBytes(xparts.reduce((a, p) => a + p.chars, 0))}` }),
      );

      const body = h('div', { class: 'xbody' });
      if (!folded) visible.forEach(m => body.appendChild(renderMessage(m)));

      refs.list.appendChild(h('div', { class: 'exch' + (xon ? ' any' : '') }, head, body));
    }

    if (!shown) {
      refs.list.appendChild(h('div', { class: 'empty', text: `Nothing matches \u201c${state.query}\u201d.` }));
    }
  }

  const fmtBytes = n => n < 1000 ? `${n} ch` : `${(n / 1000).toFixed(1)}k ch`;

  function updateTotals() {
    const sel = selectedParts();
    const msgs = state.messages.filter(m => m.parts.some(p => state.sel.has(p.id))).length;
    const chars = sel.reduce((a, p) => a + p.chars, 0);
    refs.count.textContent = sel.length
      ? `${msgs} message${msgs === 1 ? '' : 's'} · ${sel.length} part${sel.length === 1 ? '' : 's'} · ~${fmtBytes(chars)}`
      : 'Nothing selected';
    refs.md.disabled = !sel.length;
  }

  function updateSource() {
    if (!refs.src) return;
    const stubs = allParts().filter(p => p.stub).length;
    const partials = allParts().filter(p => p.partial).length;
    refs.src.textContent = state.source === 'api'
      ? `${adapter.id} · full transcript, artifact bodies included`
      : state.source === 'deep'
        ? `${adapter.id} · deep scan` + (stubs ? `, ${stubs} artifact${stubs === 1 ? '' : 's'} still unread` : ', panels read')
          + (partials ? `, ${partials} partial` : '')
        : `${adapter.id} · rendered page only`

          + (refs.idRow && !refs.idRow.hidden ? ', conversation not identified — paste its URL' : '')
          + (stubs ? `, ${stubs} artifact bod${stubs === 1 ? 'y' : 'ies'} missing — try Deep scan` : '');
    if (refs.api) refs.api.textContent = state.source === 'api' ? 'Reload transcript' : 'Load full transcript';
  }

  function askForId(candidates) {
    if (!refs.idRow) return;
    refs.idRow.hidden = false;
    if (refs.idInput) {
      refs.idInput.placeholder = candidates && candidates.length
        ? `paste this conversation\u2019s URL (${candidates.length} found, none matched the title)`
        : 'paste this conversation\u2019s URL\u2026';
      refs.idInput.focus();
    }
    updateSource();
  }

  function submitId() {
    const raw = refs.idInput ? refs.idInput.value : '';
    const id = idFromText(raw);
    if (!id) { toast('That does not contain a conversation id'); return; }
    state.convId = id;
    refs.idRow.hidden = true;
    loadApi(true, id);
  }

  async function loadEverything() {
    if (refs.load) { refs.load.disabled = true; refs.load.textContent = 'Working…'; }
    const status = sticky('Reading the conversation…');
    try {
      if (apiLoader) {
        status('Reading the full transcript…');
        await loadApi(true);
      }
      if (state.source !== 'api') {
        status('Transcript unavailable — sweeping the page…');
        state.source = 'dom';
        rescan(true);
        if (refs.list) { renderList(); renderChips(); updateTotals(); updateSource(); }
        await deepScan();
      } else {
        const stubs = allParts().filter(p => p.stub).length;
        if (stubs) {
          status(`Transcript read; opening ${stubs} artifact panel${stubs === 1 ? '' : 's'}…`);
          await deepScan();
        }
      }
    } catch (e) {
      console.warn('[chat-export] load failed:', e);
      toast('Could not load the conversation — see console');
    } finally {
      status(null);
      if (refs.load) { refs.load.disabled = false; refs.load.textContent = 'Reload everything'; }
      updateSource();
    }
  }

  async function loadApi(explicit, idHint) {
    if (!apiLoader) return;
    state.apiTried = true;
    const mine = ++loadToken;
    if (refs.api) { refs.api.disabled = true; refs.api.textContent = 'Loading…'; }
    try {
      const res = await apiLoader(idHint);
      const msgs = (res && res.messages) || [];
      if (!msgs.length) throw new Error('endpoint returned no messages');
      if (mine !== loadToken) { console.info('[chat-export] transcript arrived late, discarded'); return; }
      console.info(`[chat-export] transcript: ${msgs.length} messages, `
        + `${msgs.reduce((a, m) => a + m.parts.length, 0)} parts, ${reqCount} request(s)`
        + (verbose || loggedHint ? '' : ' — __chatExporter.verbose(true) for per-request logs'));
      loggedHint = true;
      reqCount = 0;
      state.messages = msgs;
      state.apiTitle = res.title || null;
      state.convId = res.convId || state.convId;
      state.loadedKey = currentConvKey();
      state.source = 'api';
      state.sel = new Set(allParts().map(p => p.id));
      if (refs.list) { renderList(); renderChips(); updateTotals(); }
      toast(`Loaded ${msgs.length} messages with artifact and tool content`);
    } catch (e) {
      console.warn('[chat-export] full-transcript load failed, staying on the rendered page:', e);
      if (e && e.candidates) {
        console.info('[chat-export] recent conversations on this account:', e.candidates);
      }
      if (/identify the conversation|tell which conversation/.test(e && e.message || '')) {
        askForId(e && e.candidates);
      } else if (explicit) {
        toast('Could not read the transcript — see console');
      }
    } finally {
      if (refs.api) refs.api.disabled = false;
      updateSource();
    }
  }

  function setAll(on) {
    state.sel.clear();
    if (on) allParts().forEach(p => state.sel.add(p.id));
    renderList(); renderChips(); updateTotals();
  }

  function invert() {
    const next = new Set();
    allParts().forEach(p => { if (!state.sel.has(p.id)) next.add(p.id); });
    state.sel = next;
    renderList(); renderChips(); updateTotals();
  }

  function rescan(keepSelection) {
    const off = keepSelection
      ? new Set(allParts().filter(p => !state.sel.has(p.id)).map(p => p.id))
      : null;
    state.messages = scrape();
    state.sel = new Set(allParts().filter(p => !off || !off.has(p.id)).map(p => p.id));
    if (refs.chips) renderChips();
  }

  let exportJob = null;
  function doExport(fmt) {
    if (exportJob) return exportJob;
    exportJob = runExport(fmt).finally(() => { exportJob = null; });
    return exportJob;
  }

  async function runExport(fmt) {
    if (fmt === 'zip') {
      if (!selectedParts().length) { toast('Select at least one part first'); return; }
      const status = sticky('Collecting files…');
      try {
        const { entries, missing } = await collectFiles(buildMarkdown(), status);
        if (!entries.length) {
          toast(missing.length
            ? `No file could be downloaded (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}) — the page holds no source for ${missing.length === 1 ? 'it' : 'them'}`
            : 'Nothing to bundle — the selection contains no files');
          if (missing.length) console.warn('[chat-export] no downloadable source for:', missing);
          return;
        }
        downloadBlob(zipBlob(entries), 'zip');
        toast(`Saved .zip — ${entries.length} file${entries.length === 1 ? '' : 's'}`
          + (missing.length ? `, ${missing.length} unavailable (see console)` : ''));
        if (missing.length) console.warn('[chat-export] no downloadable source for:', missing);
      } finally { status(null); }
      return;
    }

    if (fmt === 'json') {
      if (!selectedParts().length) { toast('Select at least one part first'); return; }
      download(buildJson(), 'json', 'application/json');
      toast('Saved JSON');
      return;
    }

    const md = buildMarkdown();
    if (!md) { toast('Select at least one part first'); return; }
    if (fmt === 'md') { download(md, 'md', 'text/markdown'); toast('Saved Markdown'); return; }
    if (fmt === 'txt') { download(mdToPlain(md), 'txt', 'text/plain'); toast('Saved text'); return; }

    const needsImages = /!\[[^\]]*\]\(/.test(md)
      && (state.opts.images === 'inline' || state.opts.images === 'appendix');
    const status = needsImages ? sticky('Embedding images…') : null;
    try {
      exportPdf(md, needsImages ? await resolveImages(md, state.opts.images, status) : new Map());
    } finally {
      if (status) status(null);
    }
  }

  async function doCopy() {
    const md = buildMarkdown();
    if (!md) { toast('Select at least one part first'); return; }
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard API unavailable');
      await navigator.clipboard.writeText(md);
      toast('Markdown copied');
    } catch (e) {
      console.warn('[chat-export] clipboard blocked:', e);
      download(md, 'md', 'text/markdown');
      toast('Clipboard blocked — saved a file instead');
    }
  }

  window[NS] = {
    open, close, rescan, state, adapters: ADAPTERS, adapter,
    buildMarkdown, buildText: () => mdToPlain(buildMarkdown()), buildJson,
    loadEverything, deepScan, loadApi,
    verbose(on) { verbose = on !== false; return verbose; },
    usePageOnly() {
      state.source = 'dom';
      rescan(true);
      if (refs.list) { renderList(); renderChips(); updateTotals(); updateSource(); }
      return state.messages.length;
    },
    useConversation(idOrUrl) {
      const id = idFromText(idOrUrl);
      if (!id) throw new Error('no conversation id found in: ' + idOrUrl);
      state.convId = id;
      return loadApi(true, id);
    },
    destroy() { close(); host.remove(); delete window[NS]; },
  };

  rescan(false);
  if (!state.messages.length && !apiLoader) {
    console.warn('[chat-export] no turns matched. Patch selectors via ' + NS + '.adapter.turnSelectors then ' + NS + '.rescan().');
  }

  return `[chat-export] ready (${adapter.id}) — click "Export chat", bottom right.`;
})();

  }

  boot();
})();
