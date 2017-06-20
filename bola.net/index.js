'use strict';

const libingester = require('libingester');
const moment = require('moment');
const url = require('url');

const BASE_URI = 'https://www.bola.net/';
const GALLERY_URI = 'https://www.bola.net/galeri/';
const RSS_URI = 'https://www.bola.net/feed/';

const CUSTOM_SCSS = `
$primary-light-color: #6DB30A;
$primary-medium-color: #03496D;
$primary-dark-color: #1D1D1D;
$accent-light-color: #FBB724;
$accent-dark-color: #E59F09;
$background-light-color: #F6F6F6;
$background-dark-color: #EDEDED;

$title-font: 'Arial';
$display-font: 'Oswald';
$context-font: 'Oswald';
$support-font: 'FreeSans';

@import "_default";
`;

// clean images
const REMOVE_ATTR = [
    'class',
    'data-src',
    'data-te-category',
    'data-te-label',
    'data-te-tracked',
    'style',
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'link',
    'noscript',
    'script',
    'style',
    '.clear',
    '.detail-slot-youtube',
    '.promo-ta',
    '.related_content_widget',
    '.twitter-tweet',
    '#iframe_video_partner',
    '#infeed-desktop-cont',
];

// embed video
const VIDEO_IFRAMES = [
    'a.kapanlagi',
    'skrin.id',
    'streamable',
    'youtube'
];


/** get articles metadata **/
function _get_ingest_settings($, item) {
    const canonical_uri = $('meta[property="og:url"]').attr('content');
    if (item.pubDate) {
        var date = new Date(Date.parse(item.pubDate));
    } else {
        var date = $('meta[property="article:modified_time"]').attr('content')
                || $('div.photonewsdatetime').text();
        date = date.replace(/[A-Za-z]+,/,'');
        date = new Date(Date.parse(moment(date,'DD-MM-YYYY hh:mm').format()));
    }

    return {
        author: item.author,
        body: $('.ncont').first(),
        canonical_uri: canonical_uri,
        date_published: Date.now(date),
        modified_date: date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Baca lebih lanjut tentang <a href="${canonical_uri}">bola.net</a>`,
        section: item.category || $('div.nav').first().text(),
        main_image_uri: $('meta[property="og:image"]').attr('content'),
        synopsis: $('meta[name="description"]').attr('content') || $('.photonews_desc').text(),
        source: 'bola.net',
        title: item.title || $('.photonews_title').first().text(),
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

// add zeros to left
function pad(n, width, z = '0') {
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} obj The objec {} with metadata (uri, author, etc)
 */
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.uri).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($, item);
        console.log('processing',meta.title);

        // main image
        const main_image = libingester.util.download_image(meta.main_image_uri);
        main_image.set_title(meta.title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);
        asset.set_main_image(main_image, '');

        // labeling all the text in the body
        let content = $('<div></div>');
        let last_p;
        meta.body.contents().map((i,elem) => {
            if ((elem.type == 'text' && elem.data.trim() != '') || elem.name != 'br') {
                if (!last_p) {
                    content.append($('<p></p>'));
                    last_p = content.find('p').last();
                }
                if (elem.name == 'div') {
                    const first = $(elem).children()[0] || '';
                    const second = $(elem).children()[1] || '';
                    if (first.name == 'img') {
                        elem.name = 'figure';
                    }
                    if (second.name == 'p') {
                        $(second).replaceWith($(`<figcaption><p>${$(second).text()}</p></figcaption>`));
                    }
                    content.append($(elem).clone());
                    return;
                }
                last_p.append($(elem).clone());
            } else if (elem.name == 'br') {
                last_p = undefined;
                $(elem).remove();
            }
        });
        meta.body = content;

        // first paragraph (lede)
        const first_p = meta.body.find('p').first();
        meta.lede = first_p.clone();
        meta.body.find(first_p).remove();

        // clean tags
        meta.body.contents().filter((index, node) => node.type === 'comment').remove();
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
        meta.body.find('p').filter((i,elem) => $(elem).text().trim() == '').remove();
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        meta.body.find('figure').map((i,elem) => clean_attr(elem));

        // download images
        meta.body.find('img').map((i,img) => {
            img.attribs.src = img.attribs['data-src'];
            delete img.attribs['data-src'];
            const image = libingester.util.download_img($(img));
            img.attribs['data-libingester-asset-id'] = image.asset_id;
            image.set_title(meta.title);
            hatch.save_asset(image);
        });

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_article(hatch, item);
    });
}

/**
 * ingest_gallery
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The The URI of the post to ingest
 */
function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($, {});
        meta.body = $('<div><div>');
        meta.lede = $('.photonews_desc').first();
        meta.author = 'Bolanet'; // the galleries have no author
        console.log('processing',meta.title);

        // main image
        const main_image_uri = $('.photonews_image img').first().attr('data-src');
        const main_image = libingester.util.download_image(main_image_uri);
        main_image.set_title(meta.title);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image, '');
        hatch.save_asset(main_image);

        // max number of images for generate links
        let max_num = $('.photonews_top').first().text().split('\n')[2];
        // example: of string "1 dari 10 foto" extract the string "10"
        max_num = max_num.trim().replace(/\d+[A-Za-z\s]+(\d+)[A-Za-z\s]+/,'$1');
        max_num = parseInt(max_num);

        /* generating image links why the image links are not on the page
        the format of image link is "https://cdns...20170507-001-bola.net.jpg",
        "https://cdns...20170507-002-bola.net.jpg", "https://cdns...20170507-003-bola.net.jpg", etc */
        for (var i = 2; i <= max_num; i++) {
            const image_uri = main_image_uri.replace('001-bola', pad(i, 3) + '-bola');
            const image = libingester.util.download_image(image_uri);
            image.set_title(meta.title);
            hatch.save_asset(image);
            meta.body.append($(`<figure><img data-libingester-asset-id="${image.asset_id}"/><figure>`));
        }

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_gallery(hatch, uri);
    });
}

/**
 * ingest_video
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} obj The objec {} with metadata (uri, author, etc)
 */
function ingest_video(hatch, obj) {
    return libingester.util.fetch_html(obj.uri).then($ => {
        const date = new Date(Date.parse(obj.pubDate));
        const synopsis = $('meta[name="description"]').attr('content');
        const thumb_url = $('meta[property="og:image"]').attr('content');
        const title = obj.title || $('.op-line h1').text();
        console.log('processing',obj.title);

        const save_video_asset = (video_url) => {
            if (video_url) {
                // thumbnail
                const thumbnail = libingester.util.download_image(thumb_url);
                thumbnail.set_title(title);
                hatch.save_asset(thumbnail);

                const video = new libingester.VideoAsset();
                video.set_canonical_uri(obj.uri);
                video.set_download_uri(video_url);
                video.set_last_modified_date(date);
                video.set_synopsis(synopsis);
                video.set_thumbnail(thumbnail);
                video.set_title(title);
                hatch.save_asset(video);
            }
        }

        // save video asset
        const video_page = $('.ncont iframe').first().attr('src');
        if (video_page) {
            for (const domain of VIDEO_IFRAMES) {
                if (video_page.includes(domain)) {
                    switch (domain) {
                        case 'a.kapanlagi':
                            {
                                return libingester.util.fetch_html(video_page).then($vid => {
                                    const video_url = $vid('title').text();
                                    return save_video_asset(video_url);
                                });
                                break; // exit 'a.kapanlagi'
                            }
                        case 'skrin.id':
                            {
                                const base_video_uri = 'https://play.skrin.id/media/videoarchive/';
                                const video_width = '480p.mp4';
                                let video_uri;
                                return libingester.util.fetch_html(video_page).then($vid => {
                                    const source = $vid('script')[2].children[0].data; //script data
                                    let s = source.substring(source.indexOf('JSON.parse(\'') + 12);
                                    s = s.substring(0,s.indexOf("')"));

                                    let json = JSON.parse(s);
                                    const video_uris = json.map(data => url.resolve(base_video_uri, data.url));

                                    for (const uri of video_uris) {
                                        if (uri.includes(video_width)) {
                                            video_uri = uri;
                                            break;
                                        }
                                    }

                                    if (!video_uri) video_uri = video_uris[video_uris.length - 1];
                                    return save_video_asset(video_uri);
                                }).catch(err => console.log('ERR VID:',err));
                                break; // exit 'skrin.id'
                            }
                        default:
                            {
                                return save_video_asset(video_page);
                            }
                    }
                }
            }
        }
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_video(hatch, obj);
    });
}

function main() {
    const hatch = new libingester.Hatch('bola-net', 'id');

    // create object from rss
    const get_obj = ($, item) => {
        return {
            author: $(item).find('author').text(),
            category: $(item).find('category').text(),
            pubDate: $(item).find('pubDate').text(),
            title: $(item).find('title').html().replace('<!--[CDATA[', '').replace(']]-->', ''),
            uri: $(item).find('link')[0].next['data'].replace(new RegExp('[\n\']', 'g'), ''),
        }
    }

    // all ingestor for article and video posts
    const article = libingester.util.fetch_html(RSS_URI).then($ => {
        let promises = [];
        for (const item of $('item').get()) {
            const obj = get_obj($, item);
            if (obj.category == 'open-play') {
                promises.push(ingest_video(hatch, obj)); // video articles
            } else if (obj.category != 'galeri') {
                promises.push(ingest_article(hatch, obj)); // post articles
            }
        }
        return Promise.all(promises);
    });

    // all ingestor for gallery posts
    const gallery = libingester.util.fetch_html(GALLERY_URI).then($ =>
        Promise.all($('.photonews_preview .title').get().map(item =>
            ingest_gallery(hatch, url.resolve(GALLERY_URI, item.attribs.href))
        ))
    );

    Promise.all([article, gallery])
        .then(() => hatch.finish());
}

main();
