'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'https://www.wowshack.com/';

const CUSTOM_CSS = `
$primary-light-color: #CB162D;
$primary-medium-color: #1A1A1A;
$primary-dark-color: #000000;
$accent-light-color: #CB162D;
$accent-dark-color: #670000;
$background-light-color: #F6F6F6;
$background-dark-color: #F6F6F6;

$title-font: ‘Roboto’;
$body-font: ‘Roboto Slab’;
$display-font: ‘Roboto’;
$logo-font: ‘Roboto’;
$context-font: ‘Roboto Slab’;
$support-font: ‘Roboto’;
$title-font-composite: ‘Roboto’;
$display-font-composite: ‘Roboto’;

@import "_default";
`;

//Remove elements
const REMOVE_ELEMENTS = [
    'header',
    'hr',
    'img[alt="Reactions"]',
    'ins',
    'noscript',
    'script',
    'svg',
    '.addthis_responsive_sharing',
    '.embed-block-wrapper',
    '.entry-title',
    '.fb-comments',
    '.image-block-wrapper has-aspect-ratio',
    '.main-nav',
    '.newsletter-form-field-wrapper',
    '.newsletter-form-header-title',
    '.newsletter-form-wrapper',
    '.sqs-block-horizontalrule',
    '#mobileMenuLink',
    '#mobileNav',
    '#mobileNavWrapper',
    '#taboola-below-article-thumbnails',
    '#topNav',
];

const REMOVE_ATTR = [
    'class',
    'data-image',
    'data-image-dimensions',
    'data-image-focal-point',
    'data-image-id',
    'data-layout-label',
    'data-load',
    'data-src',
    'data-type',
    'data-updated-on',
    'href',
    'style'
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const author = 'wowshack';
        const body = $('#canvas');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('.entry-content .sqs-block-content').first().text();
        const date = $('time.published').attr('datetime');
        const modified_date = new Date(Date.parse(date));
        const page = 'wowshack';
        const read_more = `Original Article at www.wowshack.com`;
        const section = 'Article'; //the blog doesn´t have section
        const title = $('meta[property="og:title"]').attr('content');
        const videos = body.find('.video-block').get().map(v => JSON.parse(v.attribs['data-block-json']));
        const tags = ['Article']; //the blog doesn´t have tags

        // uri thumbnail
        let uri_thumb_image = $('img[alt="Thumbnail"]').attr('src');
        if (videos[0] && !uri_thumb_image) {
            uri_thumb_image = videos[0].thumbnailUrl;
        }

        // remove and clean elements
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
        body.find("h3").get().map(elem => elem.name = 'p');
        const first_p = body.find('p').first();
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(first_p).remove();

        //Download images
        let thumbnail;
        body.find('img').map(function() {
            const src = this.attribs.src || this.attribs['data-src'] || '';
            if (src.includes('http') && !src.includes('visualegacy.org')) {
                this.attribs['src'] = src;
                clean_attr(this);
                const image = libingester.util.download_img($(this));
                image.set_title(title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(this).remove();
            }
        });

        // download thumbnail of the video
        if (!thumbnail) {
            thumbnail = libingester.util.download_image(uri_thumb_image);
            thumbnail.set_title(title);
            asset.set_thumbnail(thumbnail);
            hatch.save_asset(thumbnail);
        }

        // download video
        body.find('.video-block').map((i, elem) => {
            const meta = JSON.parse($(elem).attr('data-block-json'));
            const src = meta.url;
            const video = libingester.util.get_embedded_video_asset($(elem), src);
            video.set_title(title);
            video.set_thumbnail(thumbnail);
            hatch.save_asset(video);
        });

        // clean tags
        body.find('div').map((i, elem) => clean_attr(elem));

        // article settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_date_published(Date.now(modified_date));
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
        asset.set_synopsis(description);
        asset.set_title(title);
        asset.set_canonical_uri(uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.render();
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch('wowshack', { argv: process.argv.slice(2) });
    libingester.util.fetch_html(BASE_URI).then($ => {
        const links = $('#page a.project:nth-child(-n + 30)').map(function() {
            return url.resolve(BASE_URI, $(this).attr('href'));
        }).get();
        Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    });
}

main();