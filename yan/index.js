'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://www.yan.vn/';

/** cleaning elements **/
const CLEAN_ELEMENTS = [
    'a',
    'h2',
    'i',
    'p',
    'span',
    'ul',
];

/** delete attr (tag) **/
const REMOVE_ATTR = [
    'align',
    'border',
    'class',
    'onclick',
    'onmouseover',
    'style',
    'title',
];

/** remove elements (body) **/
const REMOVE_ELEMENTS = [
    'br',
    'div',
    'img[src="http://s1.img.yan.vn/yanimages/FBshare-picture.png"]',
    'noscript',
    'script',
    'style',
];

const CUSTOM_SCSS = `
$primary-light-color: #64838C;
$primary-medium-color: #5D5D5D;
$primary-dark-color: #474747;
$accent-light-color: #ED2D2D;
$accent-dark-color: #CC1010;
$background-light-color: #FEFEFE;
$background-dark-color: #DBDBDB;
$title-font: 'Montserrat';
$body-font: 'Open Sans';
$display-font: 'Open Sans';
$logo-font:  'Open Sans';
$context-font:  'Open Sans';
$support-font:  'Open Sans';
$title-font-composite: 'Roboto';
$display-font-composite: 'Roboto';
@import '_default';
`;

/** delete duplicated elements in array **/
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/** get articles metadata **/
function _get_ingest_settings($) {
    const canonical_uri = $('link[rel="canonical"]').attr('href');
    const modified_time = $('meta[property="article:modified_time"]').attr('content');
    const date = new Date(Date.parse(modified_time));
    return {
        body: $('#contentBody').first().attr('id', 'mybody'),
        authors: $('.author').first().text().split('-')[0].trim(),
        canonical_uri: canonical_uri,
        date_published: date,
        modified_date: date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Bài gốc tại <a href="${canonical_uri}">www.yan.vn</a>`,
        section: $('meta[property="article:section"]').attr('content'),
        synopsis: $('meta[property="og:description"]').attr('content'),
        source: 'yan.vn',
        title: $('meta[property="og:title"]').attr('content'),
        uri_thumb: $('meta[property="og:image"]').attr('content'),
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
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        let thumbnail;

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag) => {
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
        }

        // fix the image, add figure and figcaption (caption: String, search_caption: String, find_caption: function)
        const fix_img_with_figure = (replace, src, alt = '', to_do = 'replace', caption, search_caption, find_caption) => {
            if (src && replace) {
                let figure = $(`<figure><img src="${src}" alt='${alt}'></figure>`);
                let figcaption = $(`<figcaption></figcaption>`);
                // finding figcaption by search_caption or callback function (find_caption)
                if (typeof caption == 'string') {
                    figcaption.append(`<p>${caption}</p>`);
                } else if (find_caption) {
                    const cap = find_caption();
                    figcaption.append(`<p>${cap.html()}</p>`);
                } else if (search_caption) {
                    const cap = $(replace).find(search_caption).first();
                    figcaption.append(`<p>${cap.html()}</p>`);
                }
                // if found.. add to figure
                if (figcaption.text().trim() != '') {
                    figure.append(figcaption);
                }
                // replace or insert and return
                switch (to_do) {
                    case 'replace': { $(replace).replaceWith(figure); break; }
                    case 'after': { figure.insertAfter(replace); break; }
                    case 'before': { figure.insertBefore(replace); break; }
                }

                if (to_do != 'replace') figure = meta.body.find(`figure img[src="${src}"]`).parent();
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find('.tinlienquan').removeAttr('class');
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));


        // download images
        meta.body.find('img').map((i,elem) => {
            const alt = $(elem).attr('alt');
            const src = $(elem).attr('src') || '';
            const title = $(elem).attr('title') || '';
            const wrapp = find_first_wrapp(elem, meta.body.attr('id'));
            const em = $(wrapp).find('em').first();
            let caption;
            // find figcaption
            if (em[0]) {
                caption = em.text();
                em.remove();
            } else if (title.trim() != meta.title.trim()) {
                caption = title;
            }
            // save figure
            const figure = fix_img_with_figure(wrapp, src, alt, 'after', caption);
            const image = libingester.util.download_img($(figure.children()[0]));
            image.set_title(caption);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            $(elem).remove();
        });

        // set lede
        const first_p = meta.body.find('p').first();
        meta['lede'] = $(`<p>${first_p.text()}</p>`);
        first_p.remove();

        // convert 'p>strong' to 'h2'
        meta.body.find('p>strong').map((i,elem) => {
            const parent = $(elem).parent();
            const text = $(elem).text().trim();
            if (parent.text().trim() == text) {
                parent.replaceWith(`<h2>${text}</h2>`);
            }
        });

        // convert 'p>em' to h3
        meta.body.find('p>em').map((i,elem) => {
            if ($(elem).parent().text().trim() == $(elem).text().trim()) {
                $(elem).parent()[0].name = 'h3';
            }
        });

        // download main image
        if (!thumbnail) {
            const image = libingester.util.download_image(meta.uri_thumb);
            image.set_title(meta.title);
            asset.set_thumbnail(image);
            hatch.save_asset(image);
        }

        // delete empty elements
        meta.body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();
        meta.body.find('a').filter((i,elem) => {
            return ($(elem).text().trim() === '' && !$(elem).attr('data-soma-widget'))
        }).remove();

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    })
    .catch(err => {
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
        let meta = _get_ingest_settings($);

        const main_video_tag = $('#idMainVideo video').first();
        const download_uri = main_video_tag.attr('src');

        if (download_uri) {
            // download thumbnail
            const thumb = libingester.util.download_image(meta.uri_thumb);
            thumb.set_title(meta.title);

            // video settings
            asset.set_canonical_uri(meta.canonical_uri);
            asset.set_download_uri(download_uri);
            asset.set_last_modified_date(meta.modified_date);
            asset.set_synopsis(meta.body.text());
            asset.set_thumbnail(thumb);
            asset.set_title(meta.title);

            //save assets
            hatch.save_asset(thumb);
            hatch.save_asset(asset);
        }
    })
    .catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_video(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('yan', 'vi');
    const max_per_category = parseInt(process.argv[2]) || 5;

    // getting links
    const get_links = ($, selector) => {
        const extra = ' .titleTop a, .title a';
        let search = '';
        let all_links = [];

        // searching and filtering links by category
        for (const select of selector.split(',')) {
            // generate string for search
            for (const ext of extra.split(',')) {
                search = search + select + ext + ', ';
            }
            search = search.substring(0, search.length-2).trim();
            // finding the links and filter
            const links = $(search).filter((i,a) => $(a).attr('href'))
                .filter((i,a) => !$(a).attr('href').includes('/tag'))
                .map((i,a) => url.resolve(BASE_URI, $(a).attr('href')))
                .get().unique().slice(0,max_per_category);
            // append links and restart search
            all_links = all_links.concat(links);
            search = '';
        }

        return all_links;
    }

    // ingest post
    libingester.util.fetch_html(BASE_URI).then($ => {
        const article_links = get_links($, '.saoHome, .treHome, .choiHome, .dinhHome, .mlogHome', max_per_category);
        const video_links = get_links($, '.videoHome', max_per_category);

        const articles = article_links.map(link => ingest_article(hatch, link));
        const videos = video_links.map(link => ingest_video(hatch, link));

        return Promise.all(articles.concat(videos));
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
