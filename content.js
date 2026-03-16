(() => {
  'use strict';

  const WRAPPER_CLASS = 'rth-converted';
  const ORIGINAL_ATTR = 'data-rth-original';
  const SCANNED_ATTR = 'data-rth-scanned';

  let hourlyRate = null;
  let isActive = true;
  let usdRate = 90;
  let eurRate = 100;
  let stats = { count: 0, max: 0 };

  // =====================================================
  // Normalize text: replace all whitespace variants with
  // regular spaces for consistent matching
  // =====================================================
  function norm(text) {
    return text.replace(/[\s\u00A0\u2009\u202F\u2007\u200B]+/g, ' ').trim();
  }

  // =====================================================
  // Price pattern groups — each group has a currency
  // and list of patterns with group 1 = numeric part
  // =====================================================
  const PRICE_PATTERN_GROUPS = [
    {
      currency: 'RUB',
      patterns: [
        /(\d[\d .,]*\d)\s*₽/g,
        /(\d)\s*₽/g,
        /(\d[\d .,]*\d)\s*руб\.?/gi,
        /(\d)\s*руб\.?/gi,
        /(\d[\d .,]*\d)\s*р\b\.?/g,
        /(\d)\s*р\b\.?/g,
        /(\d[\d .,]*\d)\s*рубл[а-яё]*/gi,
        /(\d)\s*рубл[а-яё]*/gi,
      ],
    },
    {
      currency: 'USD',
      patterns: [
        /\$\s*(\d[\d .,]*\d)/g,
        /\$\s*(\d)/g,
        /(\d[\d .,]*\d)\s*\$/g,
        /(\d)\s*\$/g,
        /(\d[\d .,]*\d)\s*USD/gi,
        /(\d)\s*USD/gi,
      ],
    },
    {
      currency: 'EUR',
      patterns: [
        /€\s*(\d[\d .,]*\d)/g,
        /€\s*(\d)/g,
        /(\d[\d .,]*\d)\s*€/g,
        /(\d)\s*€/g,
        /(\d[\d .,]*\d)\s*EUR/gi,
        /(\d)\s*EUR/gi,
      ],
    },
  ];

  // Flat list of all patterns for convenience
  const ALL_PATTERNS = PRICE_PATTERN_GROUPS.flatMap((g) => g.patterns);

  function convertToRubles(price, currency) {
    if (currency === 'USD') return price * usdRate;
    if (currency === 'EUR') return price * eurRate;
    return price;
  }

  // Check if a string looks like it contains any price
  function containsPrice(text) {
    const t = norm(text);
    for (const p of ALL_PATTERNS) {
      p.lastIndex = 0;
      if (p.test(t)) return true;
    }
    return false;
  }

  // =====================================================
  // Parse a Russian-format number string to float
  // =====================================================
  function parsePrice(priceStr) {
    let s = priceStr.replace(/[\s\u00A0]+/g, '');
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      const parts = s.split(',');
      if (parts[1] && parts[1].length <= 2) {
        s = s.replace(',', '.');
      } else {
        s = s.replace(',', '');
      }
    }
    const dotParts = s.split('.');
    if (dotParts.length > 2) {
      const dec = dotParts.pop();
      s = dotParts.join('') + '.' + dec;
    }
    return parseFloat(s);
  }

  // =====================================================
  // Format hours in a human-readable way
  // =====================================================
  function formatHours(hours) {
    if (hours < 1) {
      const m = Math.round(hours * 60);
      return m <= 0 ? '<1 мин' : `${m} мин`;
    }
    if (hours < 24) {
      return hours === Math.floor(hours) ? `${hours} ч` : `${hours.toFixed(1)} ч`;
    }
    const days = hours / 8;
    if (days < 30) {
      return days === Math.floor(days) ? `${days} дн` : `${days.toFixed(1)} дн`;
    }
    const months = days / 22;
    if (months < 12) {
      return `${months.toFixed(1)} мес`;
    }
    return `${(months / 12).toFixed(1)} лет`;
  }

  // =====================================================
  // Create the badge element
  // =====================================================
  function makeBadge(originalText, priceInRubles) {
    const hours = priceInRubles / hourlyRate;
    const span = document.createElement('span');
    span.className = WRAPPER_CLASS;
    span.setAttribute(ORIGINAL_ATTR, originalText);
    span.setAttribute('title', `${originalText} → ${formatHours(hours)} работы`);
    span.textContent = `⏱ ${formatHours(hours)}`;
    stats.count++;
    if (hours > stats.max) stats.max = hours;
    return span;
  }

  // =====================================================
  // SKIP TAGS
  // =====================================================
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
    'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO',
    'IMG', 'IFRAME', 'OBJECT', 'EMBED',
  ]);

  function shouldSkip(el) {
    if (!el || !el.tagName) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.closest(`.${WRAPPER_CLASS}`)) return true;
    return false;
  }

  // =====================================================
  // STRATEGY 1: Element-level replacement
  // =====================================================
  function isPurePrice(text) {
    const t = norm(text);
    if (t.length > 60) return false;
    const stripped = t
      .replace(/[\d\s.,₽$€%\-–—]/g, '')
      .replace(/руб\.?/gi, '')
      .replace(/рубл[а-яё]*/gi, '')
      .replace(/\bр\b\.?/g, '')
      .replace(/\bUSD\b/gi, '')
      .replace(/\bEUR\b/gi, '')
      .replace(/от|до|за|шт|цена|price|стоимость/gi, '')
      .replace(/старая|новая|скидка|sale/gi, '')
      .trim();
    return stripped.length <= 5;
  }

  function findPriceElements() {
    const results = [];
    const allElements = document.body.querySelectorAll('*');

    for (const el of allElements) {
      if (shouldSkip(el)) continue;
      if (el.getAttribute(SCANNED_ATTR)) continue;
      if (el.classList.contains(WRAPPER_CLASS)) continue;

      const text = el.textContent;
      const normalized = norm(text);

      if (!containsPrice(normalized)) continue;

      let childHasPrice = false;
      for (const child of el.children) {
        if (child.classList && child.classList.contains(WRAPPER_CLASS)) continue;
        if (containsPrice(norm(child.textContent))) {
          childHasPrice = true;
          break;
        }
      }
      if (childHasPrice) continue;

      if (!isPurePrice(normalized)) continue;

      results.push(el);
    }

    return results;
  }

  function processElement(el) {
    const originalText = norm(el.textContent);

    for (const group of PRICE_PATTERN_GROUPS) {
      for (const pattern of group.patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        const m = regex.exec(originalText);
        if (m) {
          const price = parsePrice(m[1]);
          if (!isNaN(price) && price > 0) {
            const priceInRubles = convertToRubles(price, group.currency);
            const badge = makeBadge(originalText, priceInRubles);
            el.setAttribute(ORIGINAL_ATTR, el.innerHTML);
            el.setAttribute(SCANNED_ATTR, '1');
            el.innerHTML = '';
            el.appendChild(badge);
            return;
          }
        }
      }
    }

    el.setAttribute(SCANNED_ATTR, '1');
  }

  // =====================================================
  // STRATEGY 2: Text-node level replacement
  // =====================================================
  function processTextNodes() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (shouldSkip(parent)) return NodeFilter.FILTER_REJECT;
          if (parent.getAttribute(SCANNED_ATTR)) return NodeFilter.FILTER_REJECT;
          if (node.textContent.trim().length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    for (const textNode of textNodes) {
      try {
        replaceInTextNode(textNode);
      } catch (e) { /* skip */ }
    }
  }

  function replaceInTextNode(textNode) {
    const raw = textNode.textContent;
    const text = norm(raw);
    if (!containsPrice(text)) return;

    const allMatches = [];
    for (const group of PRICE_PATTERN_GROUPS) {
      for (const pattern of group.patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let m;
        while ((m = regex.exec(text)) !== null) {
          allMatches.push({
            start: m.index,
            end: m.index + m[0].length,
            full: m[0],
            priceStr: m[1],
            currency: group.currency,
          });
        }
      }
    }
    if (allMatches.length === 0) return;

    // Deduplicate overlapping matches (keep longest first)
    allMatches.sort((a, b) => a.start - b.start || b.end - a.end);
    const filtered = [allMatches[0]];
    for (let i = 1; i < allMatches.length; i++) {
      const prev = filtered[filtered.length - 1];
      if (allMatches[i].start >= prev.end) {
        filtered.push(allMatches[i]);
      }
    }

    const fragment = document.createDocumentFragment();
    let lastEnd = 0;

    for (const match of filtered) {
      if (match.start > lastEnd) {
        fragment.appendChild(document.createTextNode(text.slice(lastEnd, match.start)));
      }
      const price = parsePrice(match.priceStr);
      if (isNaN(price) || price <= 0) {
        fragment.appendChild(document.createTextNode(match.full));
      } else {
        const priceInRubles = convertToRubles(price, match.currency);
        fragment.appendChild(makeBadge(match.full, priceInRubles));
      }
      lastEnd = match.end;
    }

    if (lastEnd < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastEnd)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  // =====================================================
  // MAIN SCAN
  // =====================================================
  function scanPage() {
    if (!hourlyRate || hourlyRate <= 0 || !isActive) return;
    stats = { count: 0, max: 0 };

    const priceEls = findPriceElements();
    for (const el of priceEls) {
      try { processElement(el); } catch (e) { /* skip */ }
    }

    processTextNodes();

    try {
      chrome.runtime.sendMessage({
        action: 'stats',
        count: stats.count,
        max: stats.max,
      });
    } catch (e) {}

    console.log(`[₽→⏱] Найдено ${stats.count} цен на странице`);
  }

  // =====================================================
  // RESTORE
  // =====================================================
  function restoreAll() {
    document.querySelectorAll(`[${SCANNED_ATTR}]`).forEach((el) => {
      const html = el.getAttribute(ORIGINAL_ATTR);
      if (html !== null) {
        el.innerHTML = html;
      }
      el.removeAttribute(ORIGINAL_ATTR);
      el.removeAttribute(SCANNED_ATTR);
    });

    document.querySelectorAll(`.${WRAPPER_CLASS}`).forEach((el) => {
      const original = el.getAttribute(ORIGINAL_ATTR);
      if (original) {
        el.replaceWith(document.createTextNode(original));
      }
    });
  }

  // =====================================================
  // OBSERVER — handle dynamic content (infinite scroll etc)
  // =====================================================
  let scanDebounce;
  const observer = new MutationObserver((mutations) => {
    const dominated = mutations.every((m) => {
      if (m.type === 'attributes') {
        return m.attributeName === SCANNED_ATTR || m.attributeName === ORIGINAL_ATTR;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && node.classList && node.classList.contains(WRAPPER_CLASS)) return true;
      }
      return false;
    });
    if (dominated) return;

    clearTimeout(scanDebounce);
    scanDebounce = setTimeout(() => {
      if (isActive && hourlyRate > 0) scanPage();
    }, 800);
  });

  // =====================================================
  // INIT
  // =====================================================
  chrome.storage.sync.get(['hourlyRate', 'isActive', 'usdRate', 'eurRate'], (data) => {
    hourlyRate = data.hourlyRate || null;
    isActive = data.isActive !== false;
    usdRate = data.usdRate || 90;
    eurRate = data.eurRate || 100;

    if (hourlyRate && isActive) {
      setTimeout(scanPage, 600);
      setTimeout(scanPage, 2500);
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  // Listen for popup messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'updateSettings') {
      hourlyRate = msg.hourlyRate;
      isActive = msg.isActive;
      if (msg.usdRate) usdRate = msg.usdRate;
      if (msg.eurRate) eurRate = msg.eurRate;
      restoreAll();
      if (isActive && hourlyRate > 0) {
        setTimeout(scanPage, 200);
      }
    }
  });

  // Listen for storage changes (other tabs)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.hourlyRate) hourlyRate = changes.hourlyRate.newValue;
    if (changes.isActive) isActive = changes.isActive.newValue;
    if (changes.usdRate) usdRate = changes.usdRate.newValue;
    if (changes.eurRate) eurRate = changes.eurRate.newValue;
    restoreAll();
    if (isActive && hourlyRate > 0) {
      setTimeout(scanPage, 200);
    }
  });
})();
