'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_URI = "http://www.tamaulipas.gob.mx/feed";

//Remove elements (body)
const REMOVE_ELEMENTS = [
    'div',
    'noscript',
    'script',
];

//clean attr (tag)
const REMOVE_ATTR = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'width',
];

const CUSTOM_SCSS = `
$primary-light-color: #005CB9;
$primary-medium-color: #555555;
$primary-dark-color: #333333;
$accent-light-color: #95D600;
$background-light-color: #ffffff;
$border-light-color: #eeeeee;
$background-dark-color: #eeeeee;
$title-font: 'Roboto-Condensed';
$body-font: 'Open Sans';
$display-font: 'Roboto-Condensed';
$logo-font: 'Roboto-Condensed';
$context-font: 'Roboto-Condensed';
$support-font: 'Open Sans';
@import '_default';
`;

/* resolve the thumbnail from youtube */
const get_url_thumb_youtube = (embed_src) => {
    const thumb = '/0.jpg';
    const base_uri_img = 'http://img.youtube.com/vi/';
    const uri = url.parse(embed_src);
    const is_youtube = ((uri.hostname === 'www.youtube.com') || (uri.hostname === 'www.youtube-nocookie.com'));
    if (is_youtube && uri.pathname.includes('/embed/')) {
        const path = uri.pathname.replace('/embed/','') + thumb;
        return url.resolve(base_uri_img, path);
    }
}

/* return the first tag of the element "$main" */
const get_first_tag = ($, $main) => {
    for (const elem of $main.contents().get()) {
        if (elem.type === 'tag') return $(elem);
    }
}

/* get general metadata */
const get_ingest_settings = ($, item) => {
    const canonical_uri = $('link[rel="canonical"]').attr('href') || item.link;
    return {
        author: item.author,
        body: $('#entry').first(),
        canonical_uri: canonical_uri,
        date_published: item.date,
        modified_date: item.date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Read more at www.tamaulipas.gob.mx`,
        tags: item.categories,
        synopsis: $('meta[property="og:description"]').attr('content'),
        title: item.title.trim(),
        uri_thumb: $('meta[property="og:image"]').attr('content'),
    }
}

/* set general metadata */
const set_ingest_settings = (hatch, asset, meta) => {
    if (meta.author) asset.set_author(meta.author);
    if (meta.body) asset.set_body(meta.body);
    if (meta.canonical_uri) asset.set_canonical_uri(meta.canonical_uri);
    if (meta.custom_scss) asset.set_custom_scss(meta.custom_scss);
    if (meta.date_published) asset.set_date_published(meta.date_published);
    if (meta.modified_date) asset.set_last_modified_date(meta.modified_date);
    if (meta.read_more) asset.set_read_more_text(meta.read_more);
    if (meta.tags) asset.set_tags(meta.tags);
    if (meta.synopsis) asset.set_synopsis(meta.synopsis);
    if (meta.title) asset.set_title(meta.title);
    console.log('processing', meta.title);
    asset.render();
    hatch.save_asset(asset);
}

/* ingest the articles */
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then($ => {
        const asset = new libingester.BlogArticle();
        let meta = get_ingest_settings($, item);
        let thumbnail;

        // fix for gallery
        meta.body.find('.owl-gallery').map((i,elem) => {
            $(elem).find('.item').map((i,item) => {
                const img = $(item).find('img').first();
                if (img.attr('src')) {
                    const figcaption = $(elem).find('figcaption').first();
                    const figure = $('<figure></figure>');
                    figure.append(`<img src="${img.attr('src')}" alt="${img.attr('alt')}">`);
                    if (figcaption.text().trim() !== '') {
                        figure.append(figcaption);
                    }
                    figure.insertBefore(elem);
                }
            });
        });

        // check if first tag is image or video
        const first_tag = get_first_tag($, meta.body);
        if (first_tag[0]) {
            if (first_tag[0].name == 'img') { // main image
                const main_image_src = first_tag.attr('src');
                const main_image = libingester.util.download_image(main_image_src);
                main_image.set_title(item.title);
                first_tag.remove();
                hatch.save_asset(main_image);
                asset.set_thumbnail(main_image);
                asset.set_main_image(main_image);
            } else if (first_tag[0].name == 'div') { // main video
                const download_uri = first_tag.find('iframe').first().attr('src');
                if (download_uri) {
                    const uri_thumb = get_url_thumb_youtube(download_uri) || meta.uri_thumb;
                    const figure = $('<figure><video><video></figure>');
                    const tag_video = figure.find('video');
                    const video = libingester.util.get_embedded_video_asset(tag_video, download_uri);
                    const thumb = libingester.util.download_image(uri_thumb);
                    first_tag.replaceWith(figure);
                    thumb.set_title(meta.title);
                    video.set_title(meta.title);
                    video.set_thumbnail(thumb);
                    asset.set_thumbnail(thumb);
                    hatch.save_asset(thumb);
                    hatch.save_asset(video);
                    thumbnail = thumb;
                } else {
                    first_tag.remove();
                }
            }
        }

        // clean attr and remove elements
        const clean_attr = ($elem) => REMOVE_ATTR.forEach(attr => $elem.removeAttr(attr));
        meta.body.find('p').map((i,p) => clean_attr($(p)));
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        meta.body.find('p>figure').map((i,f) => $(f).insertBefore($(f).parent()));
        meta.body.contents().filter((i,e) => e.type === 'comment').remove();
        meta.body.find('p').filter((i,p) => {
            const text = $(p).text().trim();
            if (text === '' || text === '###') return true;
        }).remove();

        // download images
        meta.body.find('img').map((i,elem) => {
            const image = libingester.util.download_img($(elem), elem.attribs.src);
            image.set_title(meta.title);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
        });

        set_ingest_settings(hatch, asset, meta);
    })
    .catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT')
            return ingest_article(hatch, item);
        throw err;
    });
}

function main() {
    const hatch = new libingester.Hatch('tamaulipas', 'es');
    const feed = libingester.util.create_wordpress_paginator(RSS_URI);
    const maxPost = parseInt(process.argv[2]) || Infinity;
    const oldDays = parseInt(process.argv[3]) || 1;

    libingester.util.fetch_rss_entries(feed, maxPost, oldDays).then(items => {
        return Promise.all(items.map(item => ingest_article(hatch, item)));
    })
    .then(() => hatch.finish())
    .catch(err => {
        process.exitCode = 1;
        console.log(err);
    });
}

main();
