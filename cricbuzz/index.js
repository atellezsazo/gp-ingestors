'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://www.cricbuzz.com/';

const CUSTOM_SCSS = `
$primary-light-color: #468EE5;
$primary-medium-color: #314058;
$primary-dark-color: #1A64DE;
$accent-light-color: #0B9675;
$accent-dark-color: #086E56;
$background-light-color: #F8F8F8;
$background-dark-color: #E3E6E3;

$title-font: 'Liberation Sans';
$body-font: 'Liberation Serif';
$display-font: 'Liberation Sans';
$context-font: 'Liberation Sans';
$support-font: 'Liberation Sans';

@import "_default";
`;

/** cleaning elements **/
const CLEAN_ELEMENTS = [
    'p',
    'table',
    'td',
    'tr',
];

/** delete attr (tag) **/
const REMOVE_ATTR = [
    'align',
    'class',
    'style',
];

/* delete duplicated elements in array */
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/** get articles metadata **/
function _get_ingest_settings($) {
    const canonical_uri = $('link[rel="canonical"]').attr('href');

    let uri_thumb = $('link[rel="image_src"]').attr('href');
    if (!uri_thumb.includes('http:')) uri_thumb = 'http:' + uri_thumb;

    let modDate = $('meta[property="DC.date.issued"], meta[itemprop="datePublished"]').attr('content');
    if (!modDate) modDate = $('time[itemprop="datePublished"]').first().attr('datetime');
    const date = new Date(Date.parse(modDate));

    let author = $('meta[name="author"]').attr('content');
    if (!author) author = $('span[itemprop="author"]').first().text();

    return {
        author: author || 'Cricbuzz',
        canonical_uri: canonical_uri,
        date_published: date,
        modified_date: date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Original Article at <a href="${canonical_uri}">www.cricbuzz.net</a>`,
        section: $('.cb-nws-sub-txt span').first().text().trim(),
        synopsis: $('meta[property="og:description"], meta[name="description"]').attr('content'),
        source: 'cricbuzz',
        title: $('meta[property="og:title"]').attr('content'),
        uri_thumb: uri_thumb,
    }
}

/** set articles metadata **/
function _set_ingest_settings(hatch, asset, meta) {
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
    console.log('processing', meta.title);
    asset.render();
    hatch.save_asset(asset);
}

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        // some links lead to more links
        if (!$('meta[property="og:title"]').attr('content')) return;

        const asset = new libingester.NewsArticle();
        const my_body = $('#page-wrapper article').first();
        let thumbnail;
        let meta = _get_ingest_settings($);
        meta['body'] = $('<div id="mybody"></div>');

        // rendering my body
        my_body.find('section').map((i,elem) => {
            if (elem.attribs.itemprop == 'image') {
                const img = $(elem).find('img').first();
                const caption = $(elem).find('.cb-img-cptn').first();
                const image = `<img src="${'http:'+img.attr('src')}" alt="${img.attr('alt')}">`;
                const figure = $(`<figure>${image}</figure>`);
                const figcaption = $(`<figcaption><p>${caption}</p></figcaption>`);
                meta.body.append(figure.append(figcaption));
            } else if (elem.attribs.itemprop == 'articleBody') {
                const block = $(elem).find('blockquote').first()[0];
                if (!block) {
                    $(elem).find('p').filter((i,p) => $(p).text().trim() !== '')
                        .map((i,p) => meta.body.append($(p).clone()));
                }
            }
        });

        // function for download image
        meta.body.find('img').map((i,elem) => {
            if (elem.attribs.src) {
                const image = libingester.util.download_img($(elem));
                image.set_title(meta.title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(elem).remove();
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
        const clean_attr = (tag) => REMOVE_ATTR.map(attr => $(tag).removeAttr(attr));
        meta.body.find(CLEAN_ELEMENTS.join(',')).map((i,elem) => clean_attr(elem));

        // set lede
        const lede = $('.cb-nws-min-cntr').first();
        if (lede[0]) {
            // fix lede for live scores
            lede.contents().map((i,elem) => elem.name = 'span');
            lede.find('span').last().remove();
            lede.find('.text-bold').map((i,elem) => elem.name = 'strong');
            lede.find('span').map((i,elem) => {
                const div = $(elem).find('div').first();
                $(elem).append(div.children());
                div.remove();
            });
            meta.lede = $('<p></p>');
            lede.contents().filter((i,span) => $(span).text().trim() !== '')
                .map((i,span) => meta.lede.append($(span).html(), $('<br>')));
            lede.find('p, span, strong').map((i,elem) => clean_attr(elem));
        } else {
            for (const p of meta.body.find('p').get()) {
                if ($(p).parent()[0].attribs.id == 'mybody') {
                    if ($(p).find('b').first()[0]) {
                        meta.lede = $('<p></p>');
                        meta.lede.append($(p).html(), $('<br>'));
                        const next = $(p).next();
                        meta.lede.append(next.html());
                        $(p).remove();
                        next.remove();
                    } else {
                        meta.lede = $(p).clone();
                        $(p).remove();
                    }
                    break;
                }
            }
        }

        // convert 'p>b' to 'h2'
        meta.body.find('p b').map((i,elem) => {
            const p = $(elem).parent();
            const text = $(elem).text();
            if (p[0].name == 'p') {
                const p_text = p.text();
                if (p_text == text) p.replaceWith($(`<h2>${text}<h2>`));
            }
        });

        // end ingest
        _set_ingest_settings(hatch, asset, meta);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, uri);
    });
}

function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        let thumbnail;
        meta['body'] = $('<div></div>');
        meta['section'] = 'Gallery';
        meta['lede'] = $(`<p>${meta.synopsis}</p>`);

        // fixing images, add figure and figcaption
        $('.img-responsive').map((i,elem) => {
            let src = elem.attribs.source;
            if (!src.includes('http:')) src = 'http:' + src;
            const img = `<img src="${src}" alt="${elem.attribs.alt}" />`;
            const figure = $(`<figure>${img}</figure>`);
            const figcaption = $(`<figcaption><p>${elem.attribs.title}</p></figcaption>`);
            figure.append(figcaption);
            meta.body.append(figure);
        });

        // download images
        meta.body.find('img').map((i,elem) => {
            if (elem.attribs.src) {
                const image = libingester.util.download_img($(elem));
                image.set_title(meta.title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(elem).remove();
            }
        });

        // end ingest
        _set_ingest_settings(hatch, asset, meta);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_gallery(hatch, uri);
    });
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        // the "url_download" can not be obtained
        return;
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_video(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('cricbuzz', 'en');
    const resolve = (a) => url.resolve(BASE_URI, a.attribs.href);

    // finding all recent links
    const get_all_links = (uri) => {
        let all_links = [];
        return libingester.util.fetch_html(uri).then($ => {
            const feature_videos = $('#latest-vid-mod a').map((i,a) => resolve(a)).get();
            const latest_news = $('#cb-news-blck a').map((i,a) => resolve(a)).get();
            const latest_photos = $('#hm-photos-blk a').map((i,a) => resolve(a)).get();
            const main = $('.cb-hmpage a').filter((i,a) => !a.attribs.href.includes('live-cricket-scores/'))
                .map((i,a) => resolve(a)).get();
            const specials = $('h4').filter((i,h4) => $(h4).text() == 'Specials')
                .parent().find('a').map((i,a) => resolve(a)).get();

            all_links = all_links.concat(
                feature_videos.slice(0,feature_videos.length-1),
                latest_news.slice(0,latest_news.length-1),
                latest_photos.slice(0,latest_photos.length-1),
                main.slice(0,10),
                specials
            );
        }).then(() => all_links.unique());
    }

    // ingest articles
    const ingest_by_category = (hatch, uri) => {
        let category = uri.replace(BASE_URI, '');
        category = category.substring(0, category.indexOf('/'));

        switch (category) {
            case 'cricket-gallery': return ingest_gallery(hatch, uri);
            case 'cricket-videos': return ingest_video(hatch, uri);
            default: return ingest_article(hatch, uri);
        }
    }

    get_all_links(BASE_URI).then(links => {
        return Promise.all(links.map(uri => ingest_by_category(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
