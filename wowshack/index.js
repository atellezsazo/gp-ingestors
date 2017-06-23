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
    'iframe',
    'img[alt="Reactions"]',
    'img[alt="Thumbnail"]',
    'ins',
    'noscript',
    'script',
    'svg',
    '.addthis_responsive_sharing',
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
    'dir',
    'href',
    'style',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const author = 'wowshack';
        const body_main = $('.entry-content');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('.entry-content .sqs-block-content').first().text();
        const date = $('time.published').attr('datetime');
        const modified_date = new Date(Date.parse(date));
        const page = 'wowshack';
        const read_more = `Original Article at www.wowshack.com`;
        const section = 'Article'; //the blog doesn´t have section
        const title = $('meta[property="og:title"]').attr('content');
        const tags = ['Article']; //the blog doesn´t have tags
        const uri_thumb_alt = $('img[alt="Thumbnail"]').first().attr('src');
        let thumbnail;

        // generating body
        let body = $('<body id="mybody"></body>');
        body_main.find('.sqs-block-content').map((i,elem) => body.append($(elem).clone().children()));

        // remove elements
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
        body.find("h3").get().map(elem => elem.name = 'p');
        body.find('h2').map((i,elem) => elem.name = 'h4');
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // resolve the thumbnail from youtube
        function get_url_thumb_youtube(embed_src) {
            const thumb = '/maxresdefault.webp';
            const base_uri_img = 'https://i.ytimg.com/vi_webp/';
            const uri = url.parse(embed_src);
            if (uri.hostname === 'www.youtube.com' && uri.pathname.includes('/embed/')) {
                const path = uri.pathname.replace('/embed/','') + thumb;
                return url.resolve(base_uri_img, path);
            }
            return undefined;
        }

        // download images
        body.find('img').map(function() {
            const src = this.attribs.src || this.attribs['data-src'] || '';
            if (src.includes('http') && !src.includes('visualegacy.org')) {
                this.attribs['src'] = src;
                clean_attr(this);
                const figure = $('<figure></figure>').append($(this).clone());
                const image = libingester.util.download_img(figure.children());
                image.set_title(title);
                hatch.save_asset(image);
                // delete wrappers
                let wrapp = $(this);
                let parent;
                while (parent = wrapp.parent()) {
                    if (parent[0].attribs.id == 'mybody') {
                        wrapp.replaceWith(figure);
                        break;
                    } else {
                        wrapp = wrapp.parent();
                    }
                }
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(this).remove();
            }
        });

        // download video
        body.find('.sqs-video-wrapper').map((i, elem) => {
            const iframe = $(elem.attribs['data-html'])[0];
            let src = iframe.attribs.src;
            if (src.includes('www.youtube.com') && !src.includes('https:')) {
                src = 'https:' + src;
            }

            // delete wrappers
            let wrapp = $(elem);
            let parent;
            while (parent = wrapp.parent()) {
                if (parent[0].attribs.id == 'mybody') {
                    const video = libingester.util.get_embedded_video_asset(wrapp, src);
                    const uri_thumb = get_url_thumb_youtube(src);
                    const video_thumb = libingester.util.download_image(uri_thumb);
                    // download video thumbnail
                    video_thumb.set_title(title);
                    video.set_title(title);
                    video.set_thumbnail(video_thumb);
                    hatch.save_asset(video);
                    hatch.save_asset(video_thumb);
                    if (!thumbnail) asset.set_thumbnail(thumbnail = video_thumb);
                    break;
                } else {
                    wrapp = wrapp.parent();
                }
            }
        });

        // there are some pages that do not have images in the body...
        // then we are use the 'uri_thumb_alt' and add thumbnail and main_image
        if(!thumbnail && uri_thumb_alt) {
            const image = libingester.util.download_image(uri_thumb_alt);
            asset.set_thumbnail(image);
            asset.set_main_image(image);
            hatch.save_asset(image);
        }

        // clean tags
        body.find('div').map((i, elem) => clean_attr(elem));
        body.find('center, div, p').filter((i,elem) => $(elem).text().trim() == '').remove();
        body.find('h3, p').map((i,elem) => clean_attr(elem));

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
    }).catch(err => {
        if (err.code === 'ECONNRESET') return ingest_article(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('wowshack', 'en');

    libingester.util.fetch_html(BASE_URI).then($ => {
        Promise.all($('#page a.project:nth-child(-n + 30)').get()
            .map(elem => {
                const uri = url.resolve(BASE_URI, $(elem).attr('href'));// console.log(uri);
                return ingest_article(hatch, uri);
            })
        ).then(() => hatch.finish());
    })
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
