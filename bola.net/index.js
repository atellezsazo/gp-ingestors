'use strict';

const libingester = require('libingester');
const moment = require('moment');
const url = require('url');

const BASE_URI = 'https://www.bola.net/';
const GALLERY_URI = 'https://www.bola.net/galeri/';
const RSS_URI = 'https://www.bola.net/feed/';
const MAX_GALLERIES = 2;

const CUSTOM_SCSS = `
$primary-light-color: #6DB30A;
$primary-medium-color: #03496D;
$primary-dark-color: #1D1D1D;
$accent-light-color: #FBB724;
$accent-dark-color: #E59F09;
$background-light-color: #F6F6F6;
$background-dark-color: #EDEDED;
$title-font: 'Roboto';
$display-font: 'Oswald';
$context-font: 'Roboto Condensed';
$support-font: 'Roboto';
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
    let date;
    if (item.pubDate) {
        date = new Date(Date.parse(item.pubDate));
    } else {
        date = $('meta[property="article:modified_time"]').attr('content')
                || $('div.photonewsdatetime').text();
        date = date.replace(/[A-Za-z]+,/,'');
        date = moment(date,'DD-MM-YYYY hh:mm').toDate();
    }

    return {
        author: item.author,
        body: $('.ncont').first(),
        canonical_uri: canonical_uri,
        date_published: date,
        modified_date: date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Baca lebih lanjut tentang <a href="${canonical_uri}">bola.net</a>`,
        section: item.category || $('div.nav').first().text(),
        image_uri: $('meta[property="og:image"]').attr('content'),
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
    // custom logic for tagging Gallery articles;
    if (meta.section.includes("FOTO")) {
      asset.set_section("galeri");
    } else if (meta.section) {
      asset.set_section(meta.section);
    }
    if (meta.source) asset.set_source(meta.source);
    if (meta.synopsis) asset.set_synopsis(meta.synopsis);
    if (meta.title) asset.set_title(meta.title);
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

        // main image
        const image = libingester.util.download_image(meta.image_uri);
        image.set_title(meta.title);
        asset.set_thumbnail(image);
        hatch.save_asset(image);
        asset.set_main_image(image, '');

        // the content body does not have tags 'p', then add the tag wrapper,
        // a paragraph ends when a tag 'br' is found
        let content = $('<div></div>');
        let last_p; // reference to the paragraph we are constructing
        meta.body.contents().map((i,elem) => {
            // We start by validating if the 'elem' is text, or any other label that is not 'br'
            if ((elem.type == 'text' && elem.data.trim() != '') || elem.name != 'br') {
                if (!last_p) { // constructing a new paragraph
                    content.append($('<p></p>'));
                    last_p = content.find('p').last();
                }
                // if element is a 'div', check if the children are pictures
                // and if true, we create the corresponding tags (figure, figcaption)
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
                // when we find a 'br', it's time to start with another paragraph
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
function ingest_gallery(hatch, uri, meta) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        if (!meta) {
            meta = _get_ingest_settings($, {});
            meta.body = $('<div><div>');
            meta.lede = $('.photonews_desc').first();
            meta.author = 'Bolanet'; // the galleries have no author
        }

        const image_uri = $('.photonews_image img').first().attr('data-src');
        if (image_uri) {
            const image = libingester.util.download_image(image_uri);
            image.set_title(meta.title);
            hatch.save_asset(image);
            if (!meta.main_image) {
                meta.main_image = image;
            } else {
                meta.body.append($(`<figure><img data-libingester-asset-id="${image.asset_id}"/><figure>`));
            }
        }

        // next page
        const tag_a = $('#photonews_nav a')[1] || {attribs: undefined};
        let next_uri;
        if (tag_a.attribs) next_uri = tag_a.attribs.href;

        // the next image is on the next page
        if (next_uri) {
            next_uri = url.resolve(uri, next_uri);
            return ingest_gallery(hatch, next_uri, meta);
        } else {
            meta.body.contents().filter((index, node) => node.type === 'comment').remove();
            meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
            meta.body.find('div, p').filter((i,elem) => $(elem).text().trim() === '').remove();
            _set_ingest_settings(asset, meta);
            asset.set_main_image(meta.main_image, '');
            asset.set_thumbnail(meta.main_image);
            asset.render();
            hatch.save_asset(asset);
        }
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
                                    // the page content is only tags 'script'
                                    // the video links are inside a tag 'script'
                                    const source = $vid('script')[2].children[0].data; //script content
                                    // cleaning the contents of the tag...
                                    let string_data = source.substring(source.indexOf('JSON.parse(\'') + 12);
                                    string_data = string_data.substring(0, string_data.indexOf("')"));

                                    const json = JSON.parse(string_data);
                                    const video_uris = json.map(data => url.resolve(base_video_uri, data.url));

                                    // looking for the link that contains '480p.mp4'
                                    for (const uri of video_uris) {
                                        if (uri.includes(video_width)) {
                                            video_uri = uri;
                                            break;
                                        }
                                    }

                                    // if we do not find the desired link, we use the last one
                                    if (!video_uri) video_uri = video_uris[video_uris.length - 1];
                                    return save_video_asset(video_uri);
                                })
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
        Promise.all($('.photonews_preview .title').get().slice(0, MAX_GALLERIES).map(item =>
            ingest_gallery(hatch, url.resolve(GALLERY_URI, item.attribs.href))
        ))
    );

    Promise.all([article, gallery])
        .then(() => hatch.finish())
        .catch(err => {
            console.log(err);
            process.exitCode = 1;
        });
}

main();
