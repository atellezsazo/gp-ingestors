'use strict';

const libingester = require('libingester');

const BASE_URI = 'https://girleatworld.net/';
const RSS_FEED = 'https://girleatworld.net/feed/';
// cleaning elements
const CLEAN_ELEMENTS = [
    'a',
    'div',
    'figure',
    'h2',
    'i',
    'p',
    'span',
    'ul'
];

// delete attr (tag)
const REMOVE_ATTR = [
    'class',
    'data-field',
    'data-original',
    'h',
    'height',
    'id',
    'itemscope',
    'itemprop',
    'itemtype',
    'photoid',
    'rel',
    'sizes',
    'style',
    'title',
    'type',
    'w',
    'width',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    '.sharedaddy',
    'iframe',
    'ins',
    'noscript',
    'script',
    'style',
];

const CUSTOM_CSS = `
$primary-light-color: #8A9596;
$primary-medium-color: #333333;
$primary-dark-color: #252A2B;
$accent-light-color: #3BB9BF;
$accent-dark-color: #238E93;
$background-light-color: #ECF1F2;
$background-dark-color: #BAC1C3;

$title-font: 'Nunito';
$body-font: 'Raleway';
$display-font: 'Nunito';
$context-font: 'Nunito';
$support-font: 'Raleway';

@import '_default';
`;

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const author = $('.entry-author a').text();
        const modified_date = new Date(Date.parse($('.entry-date').first().text()));
        const body = $('.entry-content').first();
        const tags = $('.entry-cats').text().trim().split(',');
        const page='Girl eat world';
        const read_more = 'Read more at www.girleatworld.net';
        const description = $('meta[property="og:description"]').attr('content');
        const published = $('.entry-date a').first().text(); // for template
        const modified_time = $('meta[property="article:modified_time"]').attr('content'); // for template
        const section = $('meta[property="og:type"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');

        // Pull out the main image
        if (uri_main_image) {
            const main_img = libingester.util.download_image(uri_main_image);
            main_img.set_title(title);
            hatch.save_asset(main_img);
            asset.set_thumbnail(main_img);
        }

        // download images
       body.find('img').map(function() {
            let img = $('<figure></figure>').append($(this).clone());
            let figcaption = $(this).next()[0] || {};
            if (figcaption) {
                img.append($(`<figcaption><p>${$(figcaption).text()}</p></figcaption>`));
                $(figcaption).remove();
            }
            const image = libingester.util.download_img($(img.children()[0]));
            $(this).parent().replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
       });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
         body.find(REMOVE_ELEMENTS.join(',')).remove();
         clean_tags(body.find(CLEAN_ELEMENTS.join(',')));

        // Article Settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_title(title);
        asset.set_synopsis(description);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
        asset.set_custom_scss(CUSTOM_CSS);

        asset.render();
        hatch.save_asset(asset);

    }).catch((err) => {
        console.log(err);
    })
}

function main() {
    const hatch = new libingester.Hatch('girl_eat_world', 'en');
    libingester.util.fetch_rss_entries(RSS_FEED).then(rss => {
        const links = rss.map(item => item.link);
        return Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    });
}

main();
