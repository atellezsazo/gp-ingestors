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
const MAX_LINKS = 5;

/** cleaning elements **/
const CLEAN_ELEMENTS = [
    'a',
    'figure',
    'h2',
    'i',
    'p',
    'span',
    'table',
    'tbody',
    'td',
    'tr',
    'ul',
];

/** delete attr (tag) **/
const REMOVE_ATTR = [
    'align',
    'border',
    'class',
    'dir',
    'id',
    'onclick',
    'onmouseover',
    'style',
    'title',
    'valign',
    'width',
];

/** remove elements (body) **/
const REMOVE_ELEMENTS = [
    'blockquote',
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
    const modDate = $('meta[name="bt:modDate"], meta[name="bt:pubDate"]').attr('content');
    const date = new Date(Date.parse(modDate));
    return {
        author: $('meta[name="bt:author"]').attr('content'),
        body: $('.story-area .storypage-divider').first(),
        canonical_uri: canonical_uri,
        date_published: date,
        lede: $('.story-area .select-metadesc').first(),
        modified_date: date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Original Article at <a href="${canonical_uri}">www.rappler.com</a>`,
        section: $('.wrapper .label-wrapper a, label.no-margin a b').first().text().trim(),
        synopsis: $('meta[name="description"]').attr('content'),
        source: 'rappler',
        title: $('meta[property="og:title"], meta[name="og:title"]').attr('content'),
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

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        // no body, rendered by script
        if ($('div#app').first()[0]) return;

        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        let thumbnail;

        // function for download image
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

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();

        // remove facebook comments
        meta.body.find('iframe').map((i,elem) => {
            const src = elem.attribs.src || '';
            if (src.includes('facebook')) {
                let parent = $(elem).parent();
                while (parent[0]) {
                    if (parent[0].name == 'p') {
                        parent.remove();
                        break;
                    } else {
                        parent = parent.parent();
                    }
                }
            }
        });

        // fixed image outside the paragraphs
        meta.body.contents().map((i,elem) => {
            if (elem.name == 'img') {
                $(elem).replaceWith($('<p></p>').append($(elem).clone()));
            }
        });

        // fix images, add figure, figcaption and download
        meta.body.find('img').map((i,elem) => {
            const src = elem.attribs['data-original'];
            const alt = elem.attribs.alt;
            let parent = $(elem).parent();
            while (parent[0]) {
                if (parent[0].name == 'p' || parent[0].name == 'h1') {
                    let figure = $(`<figure><img src="${src}" alt="${alt}"/></figure>`);
                    let next = parent.find('.caption').first()[0] || parent.next()[0] || {attribs: {}};
                    if (next.attribs.class == 'caption') {
                        if ($(next).text().trim() !== '') {
                            figure.append($('<figcaption></figcaption>').append($(next).clone()));
                        }
                        $(next).remove();
                    }
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

        // download main video
        const main_video = $('.blob-inline').first()[0];
        if (main_video) {
            const src = $(main_video).find('iframe').attr('src') || '';
            if (src.includes('youtube')) {
                const first_figure = meta.body.find('figure').first()[0];
                // create a tag for video
                if (first_figure) {
                    $('<div id="main_video"></div>').insertAfter(first_figure);
                } else {
                    meta.body.prepend($('<div id="main_video"></div>'));
                }
                // download video asset
                const video = libingester.util.get_embedded_video_asset(meta.body.find('#main_video').first(), src);
                video.set_title(meta.title);
                // thumbnail video
                if (thumbnail) {
                    video.set_thumbnail(thumbnail);
                } else {
                    const thumb_uri = get_url_thumb_youtube(src);
                    const image = libingester.util.download_image(thumb_uri);
                    image.set_title(meta.title);
                    hatch.save_asset(image);
                }
                hatch.save_asset(video);
            }
        }

        // clean tags
        meta.body.find('iframe').remove();
        meta.body.find('p, span').filter((i,elem) => $(elem).text().trim() === '').remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));

        // convert 'p strong' to 'h2'
        meta.body.find('p strong').map((i,elem) => {
            const text = $(elem).text();
            let parent = $(elem).parent()[0];
            while (parent) {
                if (parent.name == 'p') {
                    const p_text = $(parent).text();
                    if (text == p_text) {
                        $(parent).replaceWith($(`<h2>${text}</h2>`));
                    }
                    break;
                } else {
                    parent = $(parent).parent()[0];
                }
            }
        });

        // clear '- Rappler.com' in the last paragraph
        const rappler_text = ['– Rappler.com', '–Rappler.com'];
        const rappler = meta.body.find('strong').last().parent();
        const last_text = rappler.text();
        for (const text of rappler_text) {
            if (last_text.includes(text)) rappler.text(last_text.replace(text, ''));
        }

        console.log('processing',meta.title);
        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_article(hatch, uri);
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

function main() {
    const hatch = new libingester.Hatch('rappler', 'en');

    _fetch_all_links(LINKS_BY_CATEGORY, MAX_LINKS).then(links => {
        return Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
