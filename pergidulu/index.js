'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');

const BASE_URI = 'https://www.pergidulu.com/';
const RSS_FEED = 'https://www.pergidulu.com/feed/'; //Artists

//Remove attributes (images)
const REMOVE_ATTR = [
    'class',
    'data-lazy-sizes',
    'data-lazy-src',
    'data-lazy-srcset',
    'height',
    'sizes',
    'src',
    'srcset',
    'width',
];

//Remove elements (body)
const REMOVE_ELEMENTS = [
    'div',
    'noscript',
    'script',
    '.post-featured-img',
];

const CUSTOM_CSS = `
$primary-light-color: #CB162D;
$primary-medium-color: #1A1A1A;
$primary-dark-color: #000000;
$accent-light-color: #CB162D;
$accent-dark-color: #670000;
$background-light-color: #F6F6F6;
$background-dark-color: #F6F6F6;

$title-font: 'Roboto';
$body-font: 'Roboto Slab';
$display-font: 'Roboto';
$logo-font: 'Roboto';
$context-font: 'Roboto Slab';
$support-font: 'Roboto';
$title-font-composite: 'Roboto';
$display-font-composite: 'Roboto';

@import "_default";
`;

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const info_article = $('div#single-below-header').first();
        const author = $(info_article).find('span.fn').text();
        const body = $('div.post-content div.content-inner').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[property="og:description"]').attr('content');
        const date = $(info_article).find('span.date').text();
        const modified_date = $('meta[property="article:published_time"]').attr('content');
        const section =$('meta[property="article:section"]').attr('content');
        const read_more = 'Original Article at www.pergidulu.com';
        const title = $('.entry-title').text() || $('meta[property="og:title"]').attr('content');
        const tags  = $('meta[property="article:tag"]').map((i, elem) => elem.attribs.content).get();

        // Pull out the main image
        let main_img = $('.post-featured-img img').first();
        if (typeof main_img.attr('data-lazy-src') !== undefined) {
            main_img.attr('src', main_img.attr('data-lazy-src'));
        }
        const main_image = libingester.util.download_img(main_img, BASE_URI);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // download images
        body.find('img').map(function() {
            if (typeof this.attribs['data-lazy-src'] !== undefined) {
                this.attribs.src = this.attribs['data-lazy-src'];
            }
            let img = $('<figure></figure>').append($(this).clone());
            const image = libingester.util.download_img(img.children());
            $(this).replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
            this.attribs["data-libingester-asset-id"] = image.asset_id;
        });

        //clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find("img").get().map((tag) => clean_attr(tag));
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

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
    });
}

function main() {
    const hatch = new libingester.Hatch('pergidulu', {
        argv: process.argv.slice(2)
    });
    rss2json.load(RSS_FEED, (err, rss) => {
        if(err) throw {code: -1, message: 'Error to load rss'}
        const links = rss.items.map(item => item.url);
        Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    });
}

main();
