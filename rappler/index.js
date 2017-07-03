'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'https://www.rappler.com/';
const LINKS_BY_CATEGORY = [
    'https://www.rappler.com/news',
    'https://www.rappler.com/video',
    'https://www.rappler.com/business',
    'https://www.rappler.com/newsbreak',
    'https://www.rappler.com/move-ph',
    'https://www.rappler.com/views',
    'https://www.rappler.com/life-and-style',
    'https://www.rappler.com/entertainment',
    'https://www.rappler.com/sports',
    'https://www.rappler.com/technology',
];

const CUSTOM_SCSS = `
$primary-light-color: #F95700;
$primary-medium-color: #333332;
$primary-dark-color: #475764;
$accent-light-color: #F95700;
$accent-dark-color: #CF4826;
$background-light-color: #F4F4F4;
$background-dark-color: #DCDCDC;

$title-font: 'Roboto Condensed';
$body-font: 'Merriweather';
$display-font: 'Roboto Condensed';
$context-font: 'Roboto';
$support-font: 'Roboto';

@import "_default";
`;

/** max links per page (Average per page: 17 links) **/
const MAX_LINKS = 2;

/** cleaning elements **/
const CLEAN_ELEMENTS = [
    'a',
    'figure',
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
    const canonical_uri = $('link[rel="canonical"]').attr('href');
    const modDate = $('meta[name="bt:modDate"]').attr('content');
    const date = new Date(Date.parse(modDate));
    return {
        author: $('meta[name="bt:author"]').attr('content'), // no authors
        body: $('.story-area .storypage-divider').first(),
        canonical_uri: canonical_uri,
        date_published: date,
        lede: $('.story-area .select-metadesc').first(),
        modified_date: date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Original Article at <a href="${canonical_uri}">www.rappler.com</a>`,
        section: $('.wrapper .label-wrapper a').first().text().trim(),
        synopsis: $('meta[name="description"]').attr('content'),
        source: 'rappler',
        title: $('meta[property="og:title"]').attr('content'),
        uri_thumb: $('meta[property="og:image"]').attr('content'),
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
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        let thumbnail;

        const download_img = (elem) => {
            if (elem.attribs.src) {
                const image = libingester.util.download_img($(elem));
                image.set_title(meta.title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(elem).remove();
            }
        };

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        meta.body.find('span').filter((i,span) => $(span).text().includes('Ads by AdAsia')).remove();
        // meta.body.find('a').get().map((a) => a.attribs.href = url.resolve(BASE_URI, a.attribs.href));

        // download images
        meta.body.find('img').map((i,elem) => {
            const src = elem.attribs['data-original'];
            const alt = elem.attribs.alt;
            let parent = $(elem).parent();
            while (parent[0]) {
                if (parent[0].name == 'p') {
                    let figure = $(`<figure><img src="${src}" alt="${alt}"/></figure>`);
                    let next = parent.next()[0] || parent.find('.caption').first()[0] || {attribs: {}};
                    if (next.attribs.class == 'caption') {
                        if ($(next).text().trim() !== '') {
                            figure.append($('<figcaption></figcaption>').append($(next).clone()));
                        }
                        $(next).remove();
                    }
                    console.log(figure.children()[0]);
                    download_img(figure.children()[0]);
                    $(parent).replaceWith(figure);
                    break;
                } else {
                    parent = parent.parent();
                }
            }
        });

        // download thumbnail
        if (!thumbnail && meta.uri_thumb) {
            const image = libingester.util.download_image(meta.uri_thumb);
            image.set_title(meta.title);
            asset.set_thumbnail(image);
            hatch.save_asset(image);
        }

        // clean tags
        // console.log(meta.body.find('p').filter((i,elem) => $(elem).is(':empty')));
        // meta.body.find('p').filter((i,elem) => $(elem).is(':empty')).remove();
        meta.body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));

        console.log('processing',meta.title);
        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => { console.log(err);
        if (err.code == 'ECONNRESET') return ingest_article(hatch, item);
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

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_article(hatch, item);
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
            console.log('processing',title);
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
        if (err.code == 'ECONNRESET') return ingest_article(hatch, item);
    });
}

/** _fetch_all_links (Promise)
 * @param {Array} links The list of links
 * @param {Number} max The max number of links per page
 */
function _fetch_all_links(links, max) {
    let all_links = []; // all links retrieved from all categories
    return Promise.all(links.map(link => libingester.util.fetch_html(link).then($ => {
        const links = $('h4 a').map((i,a) => url.resolve(BASE_URI, a.attribs.href)).get().slice(0, max);
        all_links = all_links.concat(links);
    }))).then(() => all_links.unique()); // before sending, repeated links are removed
}

/** _ingest_by_category (return Promise)
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The max number of links per page
 */
function _ingest_by_category(hatch, uri) {
    let category = uri.replace(BASE_URI,'');
    category = category.substring(0, category.indexOf('/')+1);
    console.log(category);
    // switch (category) {
    //     case 'video/': return ingest_video(hatch, uri);
    //     case 'anh/': return ingest_gallery(hatch, uri);
    //     default: return ingest_article(hatch, uri);
    // }
}

function main() {
    const hatch = new libingester.Hatch('rappler', 'en');
    const uri = 'https://www.rappler.com/views/animated/173931-inang-bayan-battered-wife-syndrome';

    ingest_article(hatch, uri).then(() => hatch.finish());
    // _fetch_all_links(LINKS_BY_CATEGORY, 5).then(links => {
    //     links.map(uri => _ingest_by_category(undefined, uri));
    //     // Promise.all(links.map(uri => _ingest_by_category(hatch, uri)))
    //     //     .then(() => hatch.finish());
    // });
}

main();
