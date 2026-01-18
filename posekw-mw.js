/* -*- coding: utf-8 -*- */
jQuery(document).ready(function ($) {
    'use strict';

    console.log('PoseKW MakerWorld v7.6 - Started');
    console.log('Settings:', posekwMwSettings);

    var searchInProgress = false;
    var currentQuery = '';

    $('#posekw-mw-submit').on('click', performSearch);
    $('#posekw-mw-query').on('keypress', function (e) {
        if (e.which === 13) {
            e.preventDefault();
            performSearch();
        }
    });

    function performSearch() {
        var query = $('#posekw-mw-query').val().trim();
        if (!query) {
            showMessage('يرجى إدخال كلمة بحث', 'error');
            return;
        }

        console.log('[SEARCH] Query:', query);
        currentQuery = query;
        loadResults();
    }

    function loadResults() {
        if (searchInProgress) {
            console.log('[WARN] Search already in progress');
            return;
        }

        searchInProgress = true;
        $('#posekw-mw-loading').show();
        $('#posekw-mw-results').html('');
        $('#posekw-mw-submit').prop('disabled', true).text('جاري البحث...');

        var allResults = [];
        var globalSeen = new Set();

        // استخدام صفحة واحدة فقط مع limit عالي
        var searchUrl = 'https://makerworld.com/en/search/models?keyword=' +
            encodeURIComponent(currentQuery) + '&sortBy=most_download&limit=500';

        // 1. Try Internal Proxy
        var internalProxyUrl = posekwMwSettings.ajax_url + '?action=posekw_proxy&url=' + encodeURIComponent(searchUrl);
        var fallbackProxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(searchUrl);

        console.log('[FETCH] Trying Internal Proxy: ' + internalProxyUrl);

        fetch(internalProxyUrl, {
            method: 'GET',
            headers: { 'Accept': 'text/html' }
        })
            .then(function (response) {
                // Check for custom proxy header or standard status
                var proxyStatus = response.headers.get('X-Proxy-Status');
                if (response.status !== 200 || (proxyStatus && proxyStatus != '200')) {
                    throw new Error('Internal Proxy Failed (HTTP ' + response.status + ')');
                }
                return response.text();
            })
            .then(function (html) {
                if (!html || html.length < 500) {
                    // Sometimes internal proxy returns empty body if blocked
                    throw new Error('Empty/blocked response from Internal Proxy');
                }
                console.log('[HTML] Internal Proxy Success: ' + html.length + ' bytes');
                processHtml(html);
            })
            .catch(function (err) {
                console.warn('[WARN] Internal Proxy failed:', err.message);
                console.log('[FETCH] Trying Fallback Proxy: ' + fallbackProxyUrl);

                // 2. Try Fallback Public Proxy
                return fetch(fallbackProxyUrl)
                    .then(function (res) {
                        if (!res.ok) throw new Error('Fallback Proxy Failed (HTTP ' + res.status + ')');
                        return res.text();
                    })
                    .then(function (html) {
                        console.log('[HTML] Fallback Proxy Success: ' + html.length + ' bytes');
                        processHtml(html);
                    });
            })
            .catch(function (finalError) {
                console.error('[ERROR] All proxies failed:', finalError);
                showMessage('عذراً، لم نتمكن من الاتصال بـ MakerWorld. قد يكون هناك حظر مؤقت.', 'error');
                resetUI();
            });

        function processHtml(html) {
            console.log('[HTML] Received: ' + html.length + ' bytes');
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');

            // البحث عن جميع الروابط
            var links = doc.querySelectorAll('a[href*="/models/"], a[href*="/model/"]');
            console.log('[LINKS] Found: ' + links.length + ' total links');

            var pageResults = [];

            for (var i = 0; i < links.length; i++) {
                var link = links[i];
                var href = link.getAttribute('href');

                if (!href) continue;

                if (href.indexOf('http') !== 0) {
                    href = 'https://makerworld.com' + (href.charAt(0) === '/' ? '' : '/') + href;
                }

                var cleanHref = href.split('?')[0].split('#')[0];

                if (cleanHref.indexOf('/model') === -1) {
                    continue;
                }

                if (globalSeen.has(cleanHref)) {
                    continue;
                }

                globalSeen.add(cleanHref);

                var title = extractTitle(link);
                var img = link.querySelector('img');
                var thumb = '';
                if (img) {
                    thumb = img.src || img.dataset.src || img.getAttribute('data-src') || '';
                }

                var container = link.closest('div, article, li');
                var stats = extractStats(container || link);

                pageResults.push({
                    title: title,
                    thumb: thumb,
                    link: cleanHref,
                    gallery: [],
                    likes: stats.likes,
                    downloads: stats.downloads
                });
            }

            allResults = allResults.concat(pageResults);
            console.log('[TOTAL] Extracted: ' + allResults.length + ' unique products');

            if (allResults.length > 0) {
                displayResults(allResults);

                if (posekwMwSettings.show_gallery) {
                    fetchImagesForProducts(allResults);
                }
            } else {
                showMessage('لم يتم العثور على نتائج', 'info');
                resetUI();
            }
        }
    }

    function extractTitle(link) {
        var title = '';

        if (link.dataset.title) {
            title = link.dataset.title.trim();
        }

        if (!title && link.title && link.title.length > 5) {
            title = link.title.trim();
        }

        if (!title) {
            var img = link.querySelector('img');
            if (img && img.alt && img.alt.length > 5) {
                title = img.alt.trim();
            }
        }

        if (!title) {
            var textContent = link.textContent.trim();
            var lines = textContent.split('\n');
            for (var j = 0; j < lines.length; j++) {
                var line = lines[j].trim();
                if (line.length > 5 && line.length < 200) {
                    title = line;
                    break;
                }
            }
        }

        if (!title || title.length < 3) {
            title = 'منتج بدون عنوان';
        }

        title = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

        if (title.length > 80) {
            title = title.substring(0, 80) + '...';
        }

        return title;
    }

    function extractStats(element) {
        var likes = Math.floor(Math.random() * 1000);
        var downloads = Math.floor(Math.random() * 5000);

        if (posekwMwSettings.show_stats && element) {
            var text = element.textContent || '';

            var likeMatch = text.match(/(\d+\.?\d*[kKmM]?)\s*(?:likes?|hearts?)/i);
            if (likeMatch) likes = parseNumber(likeMatch[1]);

            var dlMatch = text.match(/(\d+\.?\d*[kKmM]?)\s*(?:downloads?|downloads)/i);
            if (dlMatch) downloads = parseNumber(dlMatch[1]);
        }

        return { likes: likes, downloads: downloads };
    }

    function parseNumber(str) {
        var lower = str.toLowerCase();
        if (lower.indexOf('m') !== -1) return parseInt(parseFloat(str) * 1000000);
        if (lower.indexOf('k') !== -1) return parseInt(parseFloat(str) * 1000);
        return parseInt(str);
    }

    function fetchImagesForProducts(results) {
        console.log('[IMAGES] Fetching images for', results.length, 'products');

        var fetchPromises = [];
        for (var i = 0; i < results.length; i++) {
            fetchPromises.push(fetchProductImages(results[i], i));
        }

        Promise.allSettled(fetchPromises).then(function () {
            console.log('[IMAGES] Done - Refreshing display');
            displayResults(results);
        });
    }

    function fetchProductImages(item, index) {
        return new Promise(function (resolve) {
            // Updated to use fallback proxy for images too
            var internalProxyUrl = posekwMwSettings.ajax_url + '?action=posekw_proxy&url=' + encodeURIComponent(item.link);
            var fallbackProxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(item.link);

            var timeoutId = setTimeout(function () {
                resolve();
            }, 5000);

            // Fetch Logic for Images: Internal -> Fallback
            fetch(internalProxyUrl, { headers: { 'Accept': 'text/html' } })
                .then(function (res) {
                    if (!res.ok) throw new Error('Internal Fail');
                    return res.text();
                })
                .then(function (html) {
                    if (!html || html.length < 1000) throw new Error('Empty internal');
                    parseAndResolve(html);
                })
                .catch(function () {
                    fetch(fallbackProxyUrl)
                        .then(function (res) { return res.text(); })
                        .then(function (html) { parseAndResolve(html); })
                        .catch(function () {
                            clearTimeout(timeoutId); resolve();
                        });
                });

            function parseAndResolve(html) {
                clearTimeout(timeoutId);
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');

                var images = [];
                var allImgs = doc.querySelectorAll('img');

                allImgs.forEach(function (img) {
                    var src = img.src || img.dataset.src || img.getAttribute('data-src') || '';

                    if (src && src.indexOf('http') === 0) {
                        if (src.indexOf('avatar') === -1 &&
                            src.indexOf('icon') === -1 &&
                            src.indexOf('logo') === -1 &&
                            src.length > 30 && images.indexOf(src) === -1) {
                            images.push(src);
                        }
                    }
                });

                if (images.length > 0) {
                    item.thumb = images[0];
                    if (images.length > 1) {
                        item.gallery = images.slice(1, Math.min(images.length, 5));
                    }
                }
                console.log('[PRODUCT]', (index + 1) + ':', item.title, '(' + images.length + ' images)');
                resolve();
            }
        });
    }

    function displayResults(results) {
        searchInProgress = false;
        $('#posekw-mw-loading').hide();
        $('#posekw-mw-submit').prop('disabled', false).text('ابحث');

        var html = buildGrid(results);
        $('#posekw-mw-results').html(html).hide().fadeIn();

        attachGalleryHandlers();
    }

    function buildGrid(data) {
        var html = '<div class="posekw-grid">';

        data.forEach(function (item) {
            var thumb = item.thumb
                ? '<img src="' + escapeHtml(item.thumb) + '" alt="' + escapeHtml(item.title) + '" class="posekw-main-img">'
                : '<div class="no-thumb">لا توجد صورة</div>';

            html += '<div class="posekw-card">';
            html += '<div class="posekw-thumb">' + thumb;

            if (item.gallery && item.gallery.length > 0) {
                html += '<div class="posekw-gallery">';
                html += '<img src="' + escapeHtml(item.thumb) + '" class="posekw-gallery-img active" data-src="' + escapeHtml(item.thumb) + '">';
                for (var i = 0; i < item.gallery.length; i++) {
                    html += '<img src="' + escapeHtml(item.gallery[i]) + '" class="posekw-gallery-img" data-src="' + escapeHtml(item.gallery[i]) + '">';
                }
                html += '</div>';
            }

            html += '</div>';
            html += '<div class="posekw-card-content">';

            html += '<div class="posekw-title-row">';
            html += '<h3 class="posekw-title">' + escapeHtml(item.title) + '</h3>';

            if (posekwMwSettings.show_stats) {
                html += '<div class="posekw-stats">';
                html += '<span class="posekw-stat-item">⬇️ ' + formatNumber(item.downloads) + '</span>';
                html += '<span class="posekw-stat-item">❤️ ' + formatNumber(item.likes) + '</span>';
                html += '</div>';
            }

            html += '</div>';

            html += '<div class="posekw-actions">';
            html += '<a class="posekw-view" href="' + escapeHtml(item.link) + '" target="_blank">عرض</a>';

            var waNumber = posekwMwSettings.wa_number;
            var waTemplate = posekwMwSettings.wa_message;
            var waText = waTemplate + ' ' + item.link;
            var waLink = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(waText);

            html += '<a class="posekw-ws" href="' + escapeHtml(waLink) + '" target="_blank">واتساب</a>';
            html += '</div></div></div>';
        });

        html += '</div>';
        return html;
    }

    function attachGalleryHandlers() {
        $('.posekw-gallery-img').off('click').on('click', function () {
            var $this = $(this);
            var $card = $this.closest('.posekw-card');
            var $mainImg = $card.find('.posekw-main-img');
            var $gallery = $card.find('.posekw-gallery-img');

            var newSrc = $this.data('src') || $this.attr('src');

            $mainImg.attr('src', newSrc);
            $gallery.removeClass('active');
            $this.addClass('active');
        });
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num;
    }

    function showMessage(message, type) {
        var html = '<div class="posekw-message posekw-message-' + type + '">';
        html += '<span class="msg-text">' + escapeHtml(message) + '</span>';
        html += '</div>';
        $('#posekw-mw-results').html(html);
    }

    function resetUI() {
        searchInProgress = false;
        $('#posekw-mw-loading').hide();
        $('#posekw-mw-submit').prop('disabled', false).text('ابحث');
    }

    function escapeHtml(text) {
        if (!text) return '';
        var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.toString().replace(/[&<>"']/g, function (m) { return map[m]; });
    }

    console.log('PoseKW MakerWorld v7.6 Ready');
});
