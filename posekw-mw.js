/* -*- coding: utf-8 -*- */
jQuery(document).ready(function ($) {
    'use strict';

    console.log('PoseKW MakerWorld v7.9 - Premium UI');
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

        // Use MakerWorld JSON API
        // Endpoint: https://makerworld.com/api/v1/search-service/select/design2
        var apiUrl = 'https://makerworld.com/api/v1/search-service/select/design2?keyword=' +
            encodeURIComponent(currentQuery) + '&limit=50&offset=0&orderBy=most_download';

        // 1. Try Internal Proxy
        var internalProxyUrl = posekwMwSettings.ajax_url + '?action=posekw_proxy&url=' + encodeURIComponent(apiUrl);
        var fallbackProxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(apiUrl);

        console.log('[FETCH] API via Internal Proxy: ' + internalProxyUrl);

        fetch(internalProxyUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (response) {
                var proxyStatus = response.headers.get('X-Proxy-Status');
                if (response.status !== 200 || (proxyStatus && proxyStatus != '200')) {
                    throw new Error('Internal Proxy Failed (HTTP ' + response.status + ')');
                }
                return response.json(); // Expect JSON
            })
            .then(function (data) {
                // Check if data has hits
                if (!data || !data.hits) {
                    // Try parsing string if double encoded or simple HTML error
                    console.log('Data not standard JSON:', data);
                    throw new Error('Invalid JSON structure from Internal Proxy');
                }
                console.log('[API] Internal Proxy Success: ' + data.hits.length + ' results');
                processJson(data);
            })
            .catch(function (err) {
                console.warn('[WARN] Internal Proxy failed:', err.message);
                console.log('[FETCH] Trying Fallback Proxy: ' + fallbackProxyUrl);

                // 2. Try Fallback Public Proxy
                return fetch(fallbackProxyUrl)
                    .then(function (res) {
                        if (!res.ok) throw new Error('Fallback Proxy Failed (HTTP ' + res.status + ')');
                        return res.json();
                    })
                    .then(function (data) {
                        console.log('[API] Fallback Proxy Success');
                        processJson(data);
                    });
            })
            .catch(function (finalError) {
                console.error('[ERROR] All proxies failed:', finalError);
                showMessage('عذراً، لم نتمكن من الاتصال بـ MakerWorld. قد يكون هناك حظر مؤقت.', 'error');
                resetUI();
            });
    }

    function processJson(data) {
        var hits = data.hits || [];
        console.log('[API] Processing ' + hits.length + ' hits');

        var pageResults = [];

        hits.forEach(function (hit) {
            // Mapping API fields
            var title = hit.title || hit.designName || 'No Title';
            var thumb = hit.cover || hit.coverUrl || '';
            var designId = hit.designId;
            var link = 'https://makerworld.com/en/models/' + designId;

            // Stats
            var downloads = hit.downloadCount || 0;
            var likes = hit.likeCount || 0;

            // Gallery images
            var gallery = [];
            if (hit.designImages && Array.isArray(hit.designImages)) {
                hit.designImages.forEach(function (imgObj) {
                    if (imgObj.url) gallery.push(imgObj.url);
                });
            }

            // Clean up thumb URL if needed
            if (thumb && thumb.indexOf('http') !== 0) {
                // checking relative... usually API returns full
            }

            pageResults.push({
                title: title,
                thumb: thumb,
                link: link,
                gallery: gallery, // API usually gives all images! optimization!
                likes: likes,
                downloads: downloads
            });
        });

        if (pageResults.length > 0) {
            displayResults(pageResults);
        } else {
            showMessage('لم يتم العثور على نتائج', 'info');
            resetUI();
        }
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
                // Show first image (active)
                // html += '<img src="' + escapeHtml(item.thumb) + '" class="posekw-gallery-img active" data-src="' + escapeHtml(item.thumb) + '">';

                // Show max 5 gallery items
                var max = Math.min(item.gallery.length, 5);
                for (var i = 0; i < max; i++) {
                    var cls = (i === 0 && item.gallery[i] == item.thumb) ? 'active' : ''; // simplified logic
                    // Just list them
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

});
