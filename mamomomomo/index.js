'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_URI = 'http://www.mamomomomo.com/feed/';

// clean tags
const CLEAN_TAGS = [
    'a',
    'figure',
    'h2',
    'li',
    'p',
    'span',
    'ul',
];

// remove metadata
const REMOVE_ATTR = [
    'class',
    'height',
    'id',
    'rscset',
    'sizes',
    'style',
    'width',
];

// remove elements
const REMOVE_ELEMENTS = [
    'div',
    'noscript',
    'script',
    'style',
];

const CUSTOM_SCSS = `
$primary-light-color: #3A95DC;
$primary-medium-color: #3B7098;
$primary-dark-color: #24231F;
$accent-light-color: #FCB900;
$accent-dark-color: #B5963B;
$background-light-color: #F8F8F8;
$background-dark-color: #F3F3F3;
$title-font: 'Taviraj';
$body-font: 'Kanit';
$display-font: 'Taviraj';
$logo-font: 'Taviraj';
$context-font: 'Kanit';
$support-font: 'Kanit';
@import '_default';
`;

/** ingest_article
 *  @param {Object} hatch The Hatch object of the Ingester library
 *  @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const meta_date = 'meta[property="article:modified_time"], meta[property="article:published_time"]';
        const body = $('.entry-content').first().attr('id','content');
        const categories = $('.entry-categories').first();
        const description = $('meta[property="og:description"]').attr('content');
        const modified_time = $(meta_date).attr('content');
        const published_date = $('.entry-date').first().text();
        const modified_date = new Date(Date.parse(modified_time));
        const read_more = 'อ่านเพิ่มเติมที่ www.mamomomomo.com';
        const section = $('meta[property="article:section"]').attr('content');
        const tags = $('.entry-tags a').map((i,elem) => $(elem).text()).get();
        const title = $('meta[property="og:title"]').attr('content');
        const url_thumb = $('.wp-post-image[itemprop="image"]').first().attr('src');

        // clean body
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find('iframe').parent().remove();
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

        // download main image
        let main_image, thumbnail;
        if (url_thumb) {
            const url_obj = url.parse(url_thumb);
            const src = url.resolve(url_obj.href, url_obj.pathname);
            const image = libingester.util.download_image(src);
            image.set_title(title);
            asset.set_main_image(main_image = image);
            asset.set_thumbnail(thumbnail = image);
            hatch.save_asset(main_image);
        }

        // taking out the images of the paragraphs
        body.find('img').map((i,elem) => {
            const parent = $(elem).parent();
            if (parent[0].name == 'p') {
                const figure = $('<figure></figure>').append($(elem).clone());
                figure.insertAfter(parent);
                $(elem).remove();
            }
        });

        // download images
        body.find('img').get().map((img) => {
            // clean attributes
            const src = img.attribs.src;
            const alt = img.attribs.alt;
            img.attribs = {};
            img.attribs['src'] = src;
            img.attribs['alt'] = alt;
            // finding figcaption
            const next = $(img).next()[0] || {};
            if (next.name == 'figcaption') {
                delete next.attribs;
                const text = $(next).text();
                if (text.trim() !== '') {
                    next.children = [];
                    $(next).append($(`<p>${text}</p>`));
                }
            }
            // save image
            const image = libingester.util.download_img($(img));
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            hatch.save_asset(image);
        });

        // clean empty tags
        body.find('h2, p').filter((i,elem) => $(elem).text().trim() === '').remove();

        // finding author
        let last_p = body.find('p').last();
        let author = last_p.text() || '';
        let index;
        const author_text = 'sponsored by ,sponsored products from ,sponsored product from ';
        for (const text of author_text.split(',')) {
            if ((index = author.indexOf(text)) != -1) {
                author = author.substring(index+text.length);
                $(last_p).remove();
                last_p = undefined;
                break;
            }
        }

        // set generic author
        if (last_p) {
            (author == 'mamo' || author == 'Mamo') ? $(last_p).remove() : author = 'Mamo';
        }

        // clean any text in var author
        if ((index = author.lastIndexOf(',')) != -1) {
            author = author.substring(0,index);
        } else if ((index = author.indexOf('.')) != -1) {
            author = author.substring(0,index);
        }

        // article settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(uri);
        asset.set_custom_scss(CUSTOM_SCSS);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_synopsis(description);
        asset.set_tags(tags);
        asset.set_title(title);
        asset.render();
        hatch.save_asset(asset);
    })
}

function main() {
    const hatch = new libingester.Hatch('mamomomomo', 'th');
    const feed = libingester.util.create_wordpress_paginator(RSS_URI);
    // ingest_article(hatch, 'http://www.mamomomomo.com/classic-petite-daniel-wellington/').then(() => hatch.finish());
    libingester.util.fetch_rss_entries(feed, 20, 400).then(rss => {
        Promise.all(rss.map(item => ingest_article(hatch, item.link)))
            .then(() => hatch.finish());
    });
}

main();
