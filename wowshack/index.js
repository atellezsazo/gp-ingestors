'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_FEED = 'https://www.wowshack.com/feed/';

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

//Remove elements
const REMOVE_ELEMENTS = [
    'header',
    'hr',
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
    'id',
    'rel',
    'sizes',
    'style',
];

const EMBED_VIDEO = [
    'brightcove',
    'youtube',
];

/* delete duplicated elements in array */
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const author = $('#mvp-post-author .author-name').text() || 'WowShack';
        const body = $('.theiaPostSlider_preloadedSlide').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const date = $('time.published, time.updated').attr('datetime');
        const modified_date = new Date(Date.parse(date));
        const page = 'wowshack';
        const read_more = `Original Article at www.wowshack.com`;
        const section = 'Article'; //the blog doesn´t have section
        const title = $('#mvp-post-head h1').text() || $('meta[property="og:title"]').attr('content');
        // featured_category_tag is the parent category each article belongs to
        const featured_category_tag = $('span.mvp-post-cat.left').first().text();
        const tags = $('span[itemprop="keywords"] a').map((i,a) => $(a).text()).get();
        tags.push(featured_category_tag);
        const uri_thumb_alt = $('img[alt="Thumbnail"]').attr('src') || $('meta[property="og:image"]').attr('content');
        let thumbnail;

        // remove elements
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
        body.find("h3").get().map(elem => elem.name = 'p');
        body.find('h2').map((i,elem) => elem.name = 'h4');
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // resolve the thumbnail from youtube
        const get_url_thumb_youtube = (embed_src) => {
            const thumb = '/0.jpg';
            const base_uri_img = 'http://img.youtube.com/vi/';
            const uri = url.parse(embed_src);
            if (uri.hostname === 'www.youtube.com' && uri.pathname.includes('/embed/')) {
                const path = uri.pathname.replace('/embed/','') + thumb;
                return url.resolve(base_uri_img, path);
            }
        }

        // convert tags 'center' to 'p'
        body.find('p>center').map((i,elem) => $(elem).insertBefore($(elem).parent()));
        body.contents().filter((i,elem) => elem.name == 'center').map((i,elem) => elem.name = 'p');

        // download images
        body.find('img').map(function() {
            let src = this.attribs.src || this.attribs['data-src'] || '';

            // set src of srcset attr
            if (this.attribs.srcset) {
                let srcset = this.attribs.srcset.split(',');
                if (srcset.length > 0) {
                    src = srcset[0].trim();
                    src = src.substring(0, src.indexOf(' '));
                }
            }

            // verify the src
            const is_ip = src.includes('/~wowshac2/'); // http://66.147.244.76/~wowshac2/wp-content...jpeg
            const is_visualegacy = src.includes('visualegacy.org');
            const is_http = src.includes('http');

            // fix for gif's
            if (this.attribs.id == 'gif') {
                const uri_gif = this.attribs.srcset.split(',')[1];
                src = uri_gif.replace('480w','').trim();
            }

            // if (src.includes('http') && !src.includes('visualegacy.org')) {
            if (!is_ip && !is_visualegacy && is_http) {
                this.attribs['src'] = src;
                clean_attr(this);
                // add figure
                const figure = $('<figure></figure>').append($(this).clone());
                const image = libingester.util.download_img(figure.children());
                image.set_title(title);
                hatch.save_asset(image);

                // delete wrappers
                let parent = $(this).parent()[0];
                while (parent) {
                    const name = parent.name;
                    if (name == 'div' || name == 'h5' || name == 'p') {
                        const caption = $('.wp-caption-text').first().text();
                        if (caption) {
                            const figcaption = $(`<figcaption><p>${caption}</p></figcaption>`);
                            figure.append(figcaption);
                        }
                        $(parent).replaceWith(figure);
                        break;
                    } else {
                        parent = $(parent).parent()[0];
                    }
                }
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(this).remove();
            }
        });

        // download video
        body.find('p iframe').map((i, elem) => {
            let src;
            for (const domain of EMBED_VIDEO) {
                if (elem.attribs.src.includes(domain)) src = elem.attribs.src;
            }

            if (src) {
                let parent = $(elem).parent()[0];
                // delete wrappers
                while (parent) {
                    if (parent.name == 'p') {
                        let video_thumb;
                        const video = libingester.util.get_embedded_video_asset($(parent), src);
                        const uri_thumb = get_url_thumb_youtube(src);

                        // download thumbnail
                        if (uri_thumb) video_thumb = libingester.util.download_image(uri_thumb);
                        if (!video_thumb && uri_thumb_alt) video_thumb = libingester.util.download_image(uri_thumb_alt);

                        // settings video
                        video_thumb.set_title(title);
                        video.set_title(title);
                        video.set_thumbnail(video_thumb);
                        hatch.save_asset(video);
                        hatch.save_asset(video_thumb);
                        if (!thumbnail) asset.set_thumbnail(thumbnail = video_thumb);
                        break;
                    } else {
                        parent = $(parent).parent()[0];
                    }
                }
            } else {
                $(elem).remove();
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
        body.find('strong>br').remove();
        body.find('center, div, p, h5, strong').filter((i,elem) => $(elem).text().trim() == '').remove();
        body.find('h3, p, h5, a').map((i,elem) => clean_attr(elem));
        body.find('iframe').remove();

        // set synopsis
        const first_p = body.find('p').first();
        asset.set_synopsis(first_p.text());

        // convert h5 to h2
        body.find('h5').map((i,elem) => elem.name = 'h2');
        // convert 'p strong' to 'h3'
        body.find('p strong').map((i,elem) => {
            const text = $(elem).text();
            let parent = $(elem).parent()[0];
            while (parent) {
                if (parent.name == 'p') {
                    const p_text = $(parent).text();
                    if (text == p_text) {
                        $(parent).replaceWith($(`<h3>${text}</h3>`));
                    }
                    break;
                } else {
                    parent = $(parent).parent()[0];
                }
            }
        });

        // article settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
        asset.set_title(title);
        asset.set_canonical_uri(uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('wowshack', 'en');
    const feed = libingester.util.create_wordpress_paginator(RSS_FEED);
    // ingest_article(hatch, 'https://www.wowshack.com/numerical-garuda-pancasila/')
    // .then(() => hatch.finish());
    libingester.util.fetch_rss_entries(feed, 10, 30).then(items => {
        return Promise.all(items.map(item => ingest_article(hatch, item.link)))
            .then(() => hatch.finish());
    })
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
