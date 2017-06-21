'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');

const RSS_FEED = 'https://www.pergidulu.com/feed/';

//Remove attributes (images)
const REMOVE_ATTR = [
    'class',
    'data-color-override',
    'data-hover-color-override',
    'data-hover-text-color-override',
    'data-lazy-sizes',
    'data-lazy-src',
    'data-lazy-srcset',
    'height',
    'sizes',
    'srcset',
    'style',
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

function ingest_article(hatch, obj) {
    return libingester.util.fetch_html(obj.uri).then($ => {
        const asset = new libingester.BlogArticle();
        const info_article = $('div#single-below-header').first();
        const author = $(info_article).find('a[rel="author"]').text();
        const body = $('div.post-content div.content-inner').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[property="og:description"]').attr('content');
        const modified_date = $('meta[property="article:published_time"]').attr('content');
        const date = new Date(Date.parse(modified_date));
        const section =$('meta[property="article:section"]').attr('content');
        const read_more = 'Original Article at www.pergidulu.com';
        const title = $('.entry-title').text() || $('meta[property="og:title"]').attr('content');
        const tags  = obj.tags.split(' ');
        const thumb_url = $('meta[property="og:image"]').attr('content');

        // Pull out the main image
        if (thumb_url) {
            const main_image = libingester.util.download_image(thumb_url);
            main_image.set_title(title);
            hatch.save_asset(main_image);
            asset.set_thumbnail(main_image);
            asset.set_main_image(main_image);
        }

        // remove elements and comments
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach(attr => $(tag).removeAttr(attr));
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // download images
        body.find('img').map(function() {
            const lazy_src = this.attribs['data-lazy-src'] || '';
            if (lazy_src.includes('http')) {
                this.attribs.src = lazy_src;
                clean_attr(this);
                const figure = $('<figure></figure>').append($(this).clone());
                const image = libingester.util.download_img(figure.children());
                const parent = $(this).parent();
                if (parent[0].name == 'p') {
                    figure.insertAfter(parent);
                    $(this).remove();
                } else {
                    $(this).replaceWith(figure);
                }
                image.set_title(title);
                hatch.save_asset(image);
            } else {
                $(this).remove();
            }
        });

        //clean tags
        body.find('img, p, span').get().map(tag => clean_attr(tag));
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_title(title);
        asset.set_synopsis(description);
        asset.set_date_published(Date.now(date));
        asset.set_last_modified_date(date);
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.render();
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch('pergidulu', 'id');

    libingester.util.fetch_html(RSS_FEED).then($ => {
        const items = $('item').map((i,item) => {
            const contents = $(item).contents().get();
            return {
                uri: contents[4].data.replace(/[\n\t]/g,''),
                tags: contents[11].children[0].data.replace('[CDATA[','').replace(']]',''),
            }
        }).get();
        
        Promise.all(items.map(item => ingest_article(hatch, item)))
            .then(() => hatch.finish());
    });
}

main();
