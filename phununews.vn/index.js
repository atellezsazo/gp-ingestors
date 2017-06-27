'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://phununews.vn/';
const LINKS_BY_CATEGORY = [
    'http://phununews.vn/tin-tuc/', // news
    'http://phununews.vn/giai-tri/', // entertainment
    'http://phununews.vn/thi-truong/', // market
    'http://phununews.vn/bat-dong-san/', // real estate
    'http://phununews.vn/doi-song/', // life
    'http://phununews.vn/tinh-yeu-hon-nhan/', // love
    'http://phununews.vn/me-va-be/', // mother and baby
    'http://phununews.vn/lam-dep/', // beauty
    'http://phununews.vn/suc-khoe/', // health
    'http://phununews.vn/video/', // video links
    'http://phununews.vn/nau-an/', // cooking
    'http://phununews.vn/nha-dep/', // decoration
    'http://phununews.vn/anh/', // images (gallery)
];

const CUSTOM_SCSS = `
$primary-light-color: #9F9F9F;
$primary-medium-color: #3D3B41;
$primary-dark-color: #FB417F;
$accent-light-color: #B61358;
$accent-dark-color: #A30D4C;
$background-light-color: #EEEEEE;
$background-dark-color: #E6E6E6;

$title-font: 'FreeSans', 'Helvetica', 'Arial', sans-serif;
$body-font: 'Roboto';
$display-font: 'FreeSans', 'Helvetica', 'Arial', sans-serif;
$context-font: 'FreeSans', 'Helvetica', 'Arial', sans-serif;
$support-font: 'FreeSans', 'Helvetica', 'Arial', sans-serif;

@import "_default";
`;

/** max links per page (Average per page: 17 links) **/
const MAX_LINKS = 3;

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
    'div',
    'noscript',
    'script',
    'style',
];

/** delete duplicated elements in array **/
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/** get articles metadata **/
function _get_ingest_settings($) {
    const canonical_uri = $('meta[property="og:url"]').attr('content');
    const date = $('meta[property="article:modified_time"]').attr('content');
    return {
        body: $('#content-subject-detail, .fck_detail').first(),
        canonical_uri: canonical_uri,
        date_published: Date.now(date),
        lede: $(`<p>${$('.short_intro').text()}</p>`),
        modified_date: new Date(Date.parse(date)),
        custom_scss: CUSTOM_SCSS,
        read_more: `Bài gốc tại <a href="${canonical_uri}">phununews.vn</a>`,
        section: $('meta[property="article:section"]').attr('content') || $('.color1').text(),
        synopsis: $('meta[name="description"]').attr('content'),
        source: 'phununews.vn',
        title: $('meta[property="og:title"]').attr('content')
                || $('.title_news h1').first().text(),
    }
}

/** set articles metadata **/
function _set_ingest_settings(asset, meta) {
    if (meta.author) asset.set_authors(meta.author);
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

/** download images for body **/
function _download_image($, meta, hatch, asset) {
    let thumbnail;
    const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));

    meta.body.find('img').map((i, elem) => {
        if (elem.attribs.src) {
            // find the parent's for the replace it by tag figure
            clean_attr(elem);
            let parent = $(elem).parent();
            let img = $(elem).clone();
            let description = '',
                name;

            // delete wrappers
            while (parent[0]) {
                if (parent[0].name == 'p' || parent[0].name == 'table') {
                    name = parent[0].name;
                    parent[0].name = 'figure';

                    // remove any character
                    $(parent).contents().map((i,elem) => {
                        if (elem.type === 'text') $(elem).remove();
                    });

                    delete parent[0].attribs;
                    if (name == 'table') description = parent.find('tr').last().text();

                    parent.children().remove();
                    parent.append(img);
                    break;
                } else if (parent[0].name == 'div') {
                    break;
                } else {
                    parent = parent.parent();
                }
            }

            // download image
            const image = libingester.util.download_img(parent.children());
            image.set_title(meta.title);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);

            // find figcation for this image
            if (description.trim() != '') {
                parent.append($(`<figcaption><p>${description}</p></figcaption>`));
            } else {
                const figcaption = parent.next();
                const em = figcaption.find('em').first()[0]; // tag 'em' is the description
                const text = $(em).text();
                if (text.trim() != '') {
                    parent.append($(`<figcaption><p>${text}</p></figcaption>`));
                    figcaption.remove();
                }
            }
        } else {
            $(elem).remove();
        }
    });
    return thumbnail;
}

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        const uri_thumb = $('meta[property="og:image"]').attr('content');
        console.log('processing',meta.title);

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find('.tinlienquan').removeAttr('class');
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));
        meta.body.find('a').get().map((a) => a.attribs.href = url.resolve(BASE_URI, a.attribs.href));

        // download images
        let thumbnail = _download_image($, meta, hatch, asset);

        // download main image
        if (!thumbnail) {
            const image = libingester.util.download_image(uri_thumb);
            image.set_title(meta.title);
            asset.set_thumbnail(image);
            asset.set_main_image(image, '');
            hatch.save_asset(image);
        }

        // finding author
        const last_p = meta.body.find('p strong').last()[0];
        if (last_p) {
            const author = $(last_p).text().replace('Theo ','');
            meta.author = author;
            $(last_p).parent().remove();
        }
        meta.body.find('p,figcation').filter((i,elem) => $(elem).text().trim() === '').remove();

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {console.log(err);
        if (err.code == 'ECONNRESET') return ingest_article(hatch, uri);
    });
}

/** ingest_video
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        console.log('processing',meta.title);

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));

        // download images on tables
        let thumbnail;
        meta.body.find('table').map((i,table) => {
            const trs = $(table).find('tr');
            const img = $(trs[0]).find('img').first()[0];
            const txt = $(trs[1]).text() || '';
            let figure;
            if (img) {
                figure = $(`<figure><img src="${img.attribs.src}" alt="${img.attribs.alt}"/></figure>`);
                if (txt.trim() != '') {
                    figure.append($(`<figcaption>${txt}</figcaption>`));
                }
                const image = libingester.util.download_img($(figure.children()[0]));
                image.set_title(meta.title);
                hatch.save_asset(image);
                if(!thumbnail) asset.set_thumbnail(thumbnail = image);
                $(table).replaceWith(figure);
            }
        });

        // download images (normal body)
        if (!thumbnail) {
            meta.body.find('img').map((i,elem) => {
                let p = $(elem).parent();
                while (p[0]) {
                    if (p[0].name != 'p') {
                        p = p.parent();
                    } else {
                        break;
                    }
                }
                const img = $(`<img src="${elem.attribs.src}" alt="${elem.attribs.alt}"/>`);
                const figure = $(`<figure></figure>`).append(img);
                const image = libingester.util.download_img($(figure.children()[0]));
                image.set_title(meta.title);
                hatch.save_asset(image);
                if(!thumbnail) asset.set_thumbnail(thumbnail = image);
                p.replaceWith(figure);
            });
        }

        // finding author
        const last_p = meta.body.find('p strong').last()[0];
        if (last_p) {
            const author = $(last_p).text().replace('Theo ','');
            meta.author = author;
            $(last_p).parent().remove();
        }
        meta.body.find('p,figcation').filter((i,elem) => $(elem).text().trim() === '').remove();

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => { console.log(err);
        if (err.code == 'ECONNRESET') return ingest_gallery(hatch, uri);
    });
}

/** ingest_video
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.VideoAsset();
        const description = $('meta[name="description"]').attr('content');
        const dwn = $('.videogular-container').first().parent().attr('data-ng-init');
        const download_uri = dwn.substring(dwn.indexOf('http'), dwn.indexOf('mp4')+3) || '';
        const published = $('.block_timer').first().text().replace(/[\s]{2,}/g,'').replace('|',' | ').replace('G',' G');
        const modified_time = $('meta[property="article:modified_time"]').attr('content')+published.split('|')[1];
        const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // videos are rendered with 'angular.js' and sometimes the property 'data-ng-init' is empty
        if (download_uri.includes('http') && uri_thumb.includes('http')) {
            // download thumbnail
            const thumb = libingester.util.download_image(uri_thumb);
            thumb.set_title(title);

            // video settings
            asset.set_canonical_uri(uri);
            asset.set_download_uri(download_uri);
            asset.set_last_modified_date(new Date(Date.parse(modified_time)));
            asset.set_synopsis(description);
            asset.set_thumbnail(thumb);
            asset.set_title(title);

            //save assets
            hatch.save_asset(thumb);
            hatch.save_asset(asset);
        }
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_video(hatch, uri);
    });
}

/** _fetch_all_links (Promise)
 * @param {Array} links The list of links
 * @param {Number} max The max number of links per page
 */
function _fetch_all_links(links, max) {
    let all_links = []; // all links retrieved from all categories
    return Promise.all(links.map(link => libingester.util.fetch_html(link).then($ => {
        const category = link.replace(BASE_URI,'');
        const all_uris = []; // all uris (only by category)
        // clean links from other categories
        $('.txt_link').map((i,a) => {
            const uri = url.resolve(BASE_URI, a.attribs.href);
            if (uri.includes(category)) all_uris.push(uri);
        });
        // concatenate uris (only max number)
        all_links = all_links.concat(all_uris.slice(0,max));
    }))).then(() => all_links.unique()); // before sending, repeated links are removed
}

/** _ingest_by_category (return Promise)
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The max number of links per page
 */
function _ingest_by_category(hatch, uri) {
    let category = uri.replace(BASE_URI,'');
    category = category.substring(0, category.indexOf('/')+1);

    switch (category) {
        case 'video/': return ingest_video(hatch, uri);
        case 'anh/': return ingest_gallery(hatch, uri);
        default: return ingest_article(hatch, uri);
    }
}

function main() {
    const hatch = new libingester.Hatch('phununews', 'vi');

    _fetch_all_links(LINKS_BY_CATEGORY, MAX_LINKS).then(links => {
        Promise.all(links.map(uri => _ingest_by_category(hatch, uri)))
            .then(() => hatch.finish());
    });
}

main();
