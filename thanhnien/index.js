'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_FEED = 'http://thanhnien.vn/rss/home.rss';

/** cleaning elements **/
const CLEAN_ELEMENTS = [
    'a',
    'h2',
    'i',
    'p',
    'span',
    'table',
    'td',
    'tr',
    'ul',
];

/** delete attr (tag) **/
const REMOVE_ATTR = [
    'align',
    'border',
    'bordercolor',
    'cellspacing',
    'cellpadding',
    'class',
    'onclick',
    'onmouseover',
    'rules',
    'style',
    'title',
];

/** remove elements (body) **/
const REMOVE_ELEMENTS = [
    'div > article',
    'noscript',
    'script',
    'style',
];

/** get articles metadata **/
function _get_ingest_settings($) {
    const canonical_uri = $('link[rel="canonical"]').attr('href');
    const date = $('meta[property="article:published_time"]').attr('content');
    const modified_date = new Date(Date.parse(date.replace(/T/g,' ')));
    const url_image = url.parse($('meta[property="og:image"]').attr('content'));
    let authors = $('.meta-author a').map((i,elem) => $(elem).text()).get();
    if (authors.length == 0) authors = $('span.user').first().text();

    return {
        body: $('.cms-body').first().attr('id', 'mybody'),
        authors: authors,
        canonical_uri: canonical_uri,
        date_published: modified_date,
        lede: $(`<p>${$('.cms-desc').first().text()}</p>`),
        modified_date: modified_date,
        // custom_scss: CUSTOM_SCSS,
        read_more: `Bài gốc tại <a href="${canonical_uri}">thanhnien.vn</a>`,
        section: $('meta[property="article:section"]').attr('content'),
        synopsis: $('meta[property="og:description"]').attr('content'),
        source: 'thanhnien.vn',
        title: $('meta[property="og:title"]').attr('content'),
        uri_thumbnail: url.resolve(url_image.href, url_image.pathname),
    }
}

/** set articles metadata **/
function _set_ingest_settings(asset, meta) {
    if (meta.authors) asset.set_authors(meta.authors);
    if (meta.body) asset.set_body(meta.body);
    if (meta.canonical_uri) asset.set_canonical_uri(meta.canonical_uri);
    if (meta.custom_scss) asset.set_custom_scss(meta.custom_scss);
    if (meta.date_published) asset.set_date_published(meta.date_published);
    if (meta.modified_date) asset.set_last_modified_date(meta.modified_date);
    if (meta.lede) asset.set_lede(meta.lede);
    if (meta.read_more) asset.set_read_more_link(meta.read_more);
    if (meta.section) asset.set_section(meta.section);
    if (meta.source) asset.set_source(meta.source);
    if (meta.synopsis) asset.set_synopsis(meta.synopsis);
    if (meta.title) asset.set_title(meta.title);
}

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        let thumbnail;

        // resolve the thumbnail from youtube
        function get_url_thumb_youtube(embed_src) {
            const thumb = '/maxresdefault.webp';
            const base_uri_img = 'https://i.ytimg.com/vi_webp/';
            const uri = url.parse(embed_src);
            if (uri.hostname === 'www.youtube.com' && uri.pathname.includes('/embed/')) {
                const path = uri.pathname.replace('/embed/','') + thumb;
                return url.resolve(base_uri_img, path);
            }
            return undefined;
        }

        // finding first wrapp "elem": Object Cheerio; "id_main_tag": String
        function find_first_wrapp(elem, id_main_tag) {
            let current = elem;
            let parent = $(current).parent()[0];
            while (parent) {
                const attr = parent.attribs || {};
                if (attr.id == id_main_tag) {
                    return current;
                } else {
                    current = parent;
                    parent = $(current).parent()[0];
                }
            }
            return undefined;
        }

        // fix images into tables, or into divs
        meta.body.find('table.imagefull').map((i,elem) => {
            const img = $(elem).find('img').first();
            const caption = $(elem).find('div.caption').first();
            const src = img[0].attribs.src;
            const alt = img[0].attribs.alt;
            const figure = $(`<figure><img alt="${alt}" src="${src}"></figure>`);
            const figcaption = $(`<figcaption><p>${caption.text()}</p></figcaption>`);
            if (figcaption.text().trim() != '') figure.append(figcaption);
            const wrapp = find_first_wrapp(elem, meta.body.attr('id'));
            $(wrapp).replaceWith(figure);
        });

        // download videos
        meta.body.find('.video').map((i,elem) => {
            const uri_download = $(elem).find('iframe').first().attr('src');
            const wrapp = find_first_wrapp(elem, meta.body.attr('id'));
            const uri_thumbnail = get_url_thumb_youtube(uri_download);
            if (uri_download && wrapp && uri_thumbnail) {
                const video_thumb = libingester.util.download_image(uri_thumbnail);
                const video = libingester.util.get_embedded_video_asset($(wrapp), uri_download);
                video_thumb.set_title(meta.title);
                video.set_title(meta.title);
                video.set_thumbnail(video_thumb);
                hatch.save_asset(video_thumb);
                hatch.save_asset(video);
            } else {
                $(elem).remove();
            }
        });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        meta.body.contents().filter((i,elem) => elem.name == 'div').map((i,elem) => elem.name = 'p');

        // download main image
        const main_image = libingester.util.download_image(meta.uri_thumbnail);
        const main_caption = $('figure.caption').first();
        let figcaption = '';
        if (main_caption[0]) { // finding caption
            main_caption.find('i').remove();
            const span = main_caption.find('span');
            span.removeAttr('class');
            $('<br>').insertBefore(span);
            figcaption = $(`<figcaption><p>${main_caption.html()}</p></figcaption>`);
        }
        main_image.set_title(meta.title);
        asset.set_main_image(main_image, figcaption);
        asset.set_thumbnail(thumbnail = main_image);
        hatch.save_asset(main_image);

        // download images
        meta.body.find('img').map((i,elem) => {
            let parent = $(elem).parent()[0];
            let figure;
            if (parent.name == 'figure') {
                figure = $(parent);
            } else {
                parent = find_first_wrapp(elem, meta.body.attr('id'));
                figure = $(`<figure></figure>`).append(elem);
                $(parent).replaceWith(figure);
            }
            const image = libingester.util.download_img($(figure.children()[0]));
            image.set_title(meta.title);
            hatch.save_asset(image);
        });

        // fix table, convert the content to 'aside' (only one 'tr')
        meta.body.find('table').map((i,elem) => {
            const tr = $(elem).find('tr').get();
            if (tr.length == 1) {
                const aside = $('<aside></aside>');
                $(tr).find('div').map((i,div) => {
                    aside.append($(`<p>${$(div).html()}</p>`));
                });
                if (aside.text().trim() != '') {
                    $(elem).replaceWith(aside);
                }
            }
        });

        // remove author of the body, and empty tags
        meta.body.find('p > strong').last().parent().remove();
        meta.body.find('p').filter((i,elem) => $(elem).text().trim() == '').remove();
        meta.body.contents().filter((i,elem) => elem.type == 'comment').remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));

        console.log('processing',meta.title);
        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, uri);
    });
}

/** ingest_video
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.VideoAsset();
        const meta = _get_ingest_settings($);
        let download_uri = $('#mainplayer').attr('data-video-src');

        // finding youtube video
        if (!download_uri) download_uri = $('.video iframe').first().attr('src');

        if (download_uri) {
            // download thumbnail
            const thumb = libingester.util.download_image(meta.uri_thumbnail);
            thumb.set_title(meta.title);

            // video settings
            asset.set_canonical_uri(meta.canonical_uri);
            asset.set_download_uri(download_uri);
            asset.set_last_modified_date(meta.modified_date);
            asset.set_synopsis(meta.synopsis);
            asset.set_thumbnail(thumb);
            asset.set_title(meta.title);

            //save assets
            hatch.save_asset(thumb);
            hatch.save_asset(asset);
        }
    }).catch(err => {
        console.log(err);
        if (err.code == 'ECONNRESET') return ingest_video(hatch, uri);
    });
}

/** _ingest_by_category (return Promise)
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The max number of links per page
 */
function _ingest_by_category(hatch, uri) {
    let category = url.parse(uri).hostname;

    if (category == 'video.thanhnien.vn' || uri.includes('/video/')) {
        return ingest_video(hatch, uri);
    } else {
        return ingest_article(hatch, uri);
    }
}

function main() {
    const hatch = new libingester.Hatch('thanhnien', 'vi');

    libingester.util.fetch_html(RSS_FEED).then($ => {
        const links = $('item guid').filter((i,elem) => $(elem).text() != '')
            .map((i,elem) => $(elem).text()).get();

        return Promise.all(links.map(uri => _ingest_by_category(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
