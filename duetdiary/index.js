'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');
const url = require('url');

const BASE_URI = 'http://www.duetdiary.com/';
const RSS_FEED = "http://www.duetdiary.com/feed/";

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'a[href="#"]',
    'div',
    'iframe',
    'ins',
    'noscript',
    'script',
    'style',
    'video',
    '.adsbygoogle',
    '.essb_links',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'class',
    'height',
    'id',
    'lang',
    'rel',
    'style',
    'width',
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'b',
    'br',
    'div',
    'em',
    'i',
    'img',
    'span',
    'ul'
];

const CUSTOM_CSS = `
$primary-light-color: #009ADD;
$primary-medium-color: #156BA7;
$primary-dark-color: #002333;
$accent-light-color: #BE202E;
$accent-dark-color: #603A17;
$background-light-color: #F7F7F7;
$background-dark-color: #F2F2F2;

$title-font: 'Maitree';
$body-font: 'Prompt';
$display-font: 'Maitree';
$logo-font: 'Maitree';
$context-font: 'Prompt';
$support-font: 'Prompt';

@import '_default';
`;

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const base_uri = libingester.util.get_doc_base_uri($, uri);
        const asset = new libingester.BlogArticle();

        const author = $('.post-author').text();
        const body = $('.entry-content').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[property="og:description"]').attr('content');
        const date = $('.post-date').first().text();
        const modified_date = new Date(Date.parse(date));
        const section ='Article';
        const read_more = 'บทความต้นฉบับที่ www.duetdiary.com';
        const title = $('meta[property="og:title"]').attr('content');
        const main_img = $('meta[property="og:image"]').attr('content');
        const tags = $('span.tags a').map((i, elem) => $(elem).text()).get();

        // Pull out the main image
        if (!main_img) { //problem with incomplete $
            throw { code: -1 , message: 'Incomplete DOM'};
        }

        const main_image = libingester.util.download_image(main_img, BASE_URI);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image);

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // download images
        body.find('img').map(function() {
            this.attribs.src = url.resolve(BASE_URI,this.attribs.src).replace('https','http');
            let img = $('<figure></figure>').append($(this).clone());
            const image = libingester.util.download_img(img.children());
            this.attribs["data-libingester-asset-id"] = image.asset_id;
            $(this).replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
        });

        //clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

        // Article Settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_title(title);
        asset.set_synopsis(description);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_article(hatch, uri);
        }
    });
}

function main() {

    let MAX_DAYS_OLD = 1;
    if (process.env.MAX_DAYS_OLD)
        MAX_DAYS_OLD = parseInt(process.env.MAX_DAYS_OLD);

console.log(RSS_FEED);

        // wordpress pagination
    const feed = libingester.util.create_wordpress_paginator(RSS_FEED);

    const hatch = new libingester.Hatch('duetdiary', 'th');

    libingester.util.fetch_rss_entries(feed, 100, MAX_DAYS_OLD).then(rss => {
            console.log(`Ingesting ${rss.length} articles...`);

            return Promise.all(rss.map(entry =>

                ingest_article(hatch, entry)));
        })
        .then(() => hatch.finish())
        .catch(err => {
            console.log(err);
            // Exit without cutting off pending operations
            process.exitCode = 1;
        });


    // rss2json.load(RSS_FEED, (err, rss) => {
    //     if (err) throw { code: -1, message: 'Error to load rss' }
    //     const links = rss.items.map(item => item.url);
    //     Promise.all(links.map(uri => ingest_article(hatch, uri)))
    //         .then(() => hatch.finish());
    // });
}

main();
