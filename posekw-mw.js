/* -*- coding: utf-8 -*- */
jQuery(document).ready(function ($) {
    'use strict';

    console.log('PoseKW MakerWorld v7.19 - Centered Title & SVG Icons');
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
            var designName = hit.title || hit.designName || 'No Name';
            var coverUrl = hit.cover || (hit.designImages && hit.designImages[0] ? hit.designImages[0].url : '') || '';
            var likeCount = hit.likeCount || 0;
            var downloadCount = hit.downloadCount || 0;

            // Extract Gallery Images (Correct Path: designExtension.design_pictures)
            var gallery = [];

            // 1. Try designExtension.design_pictures (Most common for search results)
            if (hit.designExtension && hit.designExtension.design_pictures && Array.isArray(hit.designExtension.design_pictures)) {
                hit.designExtension.design_pictures.forEach(function (imgObj) {
                    if (imgObj.url && imgObj.url !== coverUrl) { // Avoid duplicate cover
                        gallery.push(imgObj.url);
                    }
                });
            }
            // 2. Fallback to designImages (if API changes)
            else if (hit.designImages && Array.isArray(hit.designImages)) {
                hit.designImages.forEach(function (imgObj) {
                    if (imgObj.url && imgObj.url !== coverUrl) gallery.push(imgObj.url);
                });
            }

            // If gallery is empty, we DO NOT force duplicates here. 
            // We handle "no gallery" in the buildGrid function to avoid 3 identical images if not desired, 
            // or we can push the cover if we really want a strip. 
            // User complained about "all same images", so let's ONLY show gallery if we have distinct images.
            // If only 1 image exists (cover), we might show it in gallery or not. 
            // Let's add cover to gallery if gallery is empty, so we at least have 1 thumb to click.
            if (gallery.length === 0 && coverUrl) {
                // strict mode: don't push cover to gallery to avoid "duplicate" visual if we want distinct thumbs.
                // But layout expects gallery? 
                // Let's NOT push cover to gallery array to keep it clean.
            }

            pageResults.push({
                title: designName,
                thumb: coverUrl,
                likes: likeCount,
                downloads: downloadCount,
                link: 'https://makerworld.com/en/models/' + hit.id,
                gallery: gallery
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

            // Stats HTML (Floating Badges with Inline SVGs)
            var iconHeart = '<svg viewBox="0 0 512 512"><path d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z"/></svg>';
            var iconDownload = '<svg viewBox="0 0 512 512"><path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24z"/></svg>';

            var statsHtml = '<div class="posekw-stats-overlay">' +
                '<span class="posekw-stat-badge likes">' + iconHeart + ' ' + formatNumber(item.likes) + '</span>' +
                '<span class="posekw-stat-badge downloads">' + iconDownload + ' ' + formatNumber(item.downloads) + '</span>' +
                '</div>';

            html += '<div class="posekw-card">';

            // Thumbnail Container with Stats Overlay
            html += '<div class="posekw-thumb">' + thumb + statsHtml;

            // Gallery Logic
            var galleryImages = item.gallery || [];
            if (galleryImages.length > 0) {
                html += '<div class="posekw-gallery">';
                var max = Math.min(galleryImages.length, 4);

                // Add first thumb as inactive if not present, to ensure main view
                // Actually, just listing gallery images is cleaner for the overlay strip
                for (var i = 0; i < max; i++) {
                    var img = galleryImages[i];
                    html += '<img src="' + escapeHtml(img) + '" class="posekw-gallery-img" data-src="' + escapeHtml(img) + '">';
                }
                html += '</div>';
            }
            html += '</div>'; // End posekw-thumb

            // Card Content (Minimal: Title + Actions only)
            html += '<div class="posekw-card-content">';
            html += '<h3 class="posekw-title" title="' + escapeHtml(item.title) + '">' + escapeHtml(item.title) + '</h3>';

            html += '<div class="posekw-actions">';
            html += '<a href="' + escapeHtml(item.link) + '" target="_blank" class="posekw-view">عرض</a>';
            html += '<a href="https://wa.me/?text=' + encodeURIComponent(item.title + ' ' + item.link) + '" target="_blank" class="posekw-ws"><i class="fab fa-whatsapp"></i> واتساب</a>';
            html += '</div>';

            html += '</div>'; // End card-content
            html += '</div>'; // End card
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
