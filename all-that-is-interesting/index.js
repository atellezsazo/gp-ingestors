'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_URI = "http://all-that-is-interesting.com/feed";

//Remove elements (body)
const REMOVE_ELEMENTS = [
    'br + br',
    'br',
    'hr + p',
    'noscript',
    'script',
    '.gallery-descriptions-wrap',
    '.gallery-preview',
    'hr',
    '.credit',
    '.hidden-md-up',
    '.related-posts',
    '.social-callout',
    '.social-list',
    '.sm-page-count',
    '.twitter_com',
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

const CUSTOM_CSS = `
$primary-light-color: #0565A0;
$primary-medium-color: #1B242E;
$primary-dark-color: #020202;
$accent-light-color: #0091EA;
$accent-dark-color: #0078C1;
$background-light-color: #DDDDD5;
$background-dark-color: #E4E4E4;

$title-font: 'Work Sans';
$body-font: 'Open Sans';
$display-font: 'Work Sans';
$logo-font: 'Work Sans';
$context-font: 'Open Sans';
$support-font: 'Work Sans';

$highlighted-background-color: #000000;

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

function ingest_post(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const base_uri = libingester.util.get_doc_base_uri($, uri);

        const by_line = $('.post-heading .container .row .byline').first();
        const author = by_line.find('.author').first().text();
        const published = by_line.find('.date').first().text();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const read_more = 'Original Article at www.all-that-is-interesting.com';
        const title = $('meta[property="og:title"]').attr('content');
        const modified_date = $('meta[property="article:modified_time"]').attr('content');
        const description = $('meta[property="og:description"]').attr('content');
        const tags = $('meta[property="article:tag"]').map((i, elem) => $(elem).attr('content')).get();
        const date = new Date(modified_date ? Date.parse(modified_date) : new Date());

        //main-image
        const main_image = $('meta[property="og:image"]').attr('content');
        const main_img = libingester.util.download_image(main_image, base_uri);
        main_img.set_title(title);
        hatch.save_asset(main_img);
        asset.set_thumbnail(main_img);
        asset.set_main_image(main_img);

        // Article Settings
        console.log('processing: '+ title);
        asset.set_author(author);
        asset.set_synopsis(description);
        asset.set_title(title);
        asset.set_canonical_uri(canonical_uri);
        asset.set_read_more_text(read_more);
        asset.set_tags(tags);
        asset.set_date_published(Date.now(date));
        asset.set_last_modified_date(date);

        let body = $('<div></div>');

        const ingest_body = ($, finish_process) => {
            const post_body = $('article.post-content');
            const info_img = $('.gallery-descriptions-wrap').first();

            //remove elements (body)
            for (const remove_element of REMOVE_ELEMENTS) {
                post_body.find(remove_element).remove();
            }

            post_body.find("img").map(function() {
                const parent = $(this);
                if (this.attribs.src) {
                    const description = this.parent.attribs['aria-describedby'];
                    const figure = $('<figure></figure>').append($(this).clone());
                    if (description) { //save image info
                        const info_image = info_img.find('#' + description).first()[0];
                        let figcaption;
                        if (info_image) {
                            if ($(info_image).text().trim() != '') {
                                figure.append($(`<figcaption><p>${$(info_image).html()}</p></figcaption>`));
                            }
                        }
                        post_body.append(figure);
                        $(this).remove();
                    }
                    else {
                        const fig_description= $(this).parent().find('p').html() || '';
                        if (fig_description.trim() != '') {
                            figure.append($(`<figcaption><p>${fig_description}</p></figcaption>`));
                        }
                        $(this).parent().replaceWith(figure);
                    }

                    const image = libingester.util.download_img($(figure.children()[0]), base_uri);
                    for (const attr of REMOVE_ATTR) {
                        delete this.attribs[attr];
                    }
                    image.set_title(this.attribs.title || title);
                    hatch.save_asset(image);
                }
            });

            //clean image wrap
            post_body.find(".wp-caption").map(function() {
                for (const attr of REMOVE_ATTR) {
                    if (this.attribs[attr]) {
                        delete this.attribs[attr];
                    }
                }
                this.attribs.class = "image-wrap";
            });

            // download video from youtube
            post_body.find('.youtube_com, p>iframe').map((i,elem) => {
                if (elem.name == 'iframe') elem = $(elem).parent()[0];
                const src = $(elem).find('iframe').attr('src');
                if (src) {
                    const uri_thumb = get_url_thumb_youtube(src);
                    let thumbnail = main_img;
                    if (uri_thumb) {
                        thumbnail = libingester.util.download_image(uri_thumb);
                        thumbnail.set_title(title);
                        hatch.save_asset(thumbnail);
                    }
                    const figure = $('<figure><video></video></figure>');
                    $(elem).replaceWith(figure);
                    const tag_video = figure.find('video');
                    const video = libingester.util.get_embedded_video_asset(tag_video, src);
                    video.set_title(title);
                    video.set_thumbnail(thumbnail);
                    hatch.save_asset(video);
                } else {
                    $(elem).remove();
                }
            });

            post_body.find('.gallery-section').remove();

            post_body.find(".end-slide").parent().remove();
            body.append(post_body.children());

            const next = $('nav.pagination a.next').attr('href');
            if (next) {
                libingester.util.fetch_html(next).then(($next_profile) => {
                    ingest_body($next_profile, finish_process);
                });
            } else {
                finish_process();
            }
        };

        return new Promise((resolve, reject) => {
            ingest_body($, () => {
                asset.set_body(body);
                asset.set_custom_scss(CUSTOM_CSS);
                asset.render();
                hatch.save_asset(asset);
                resolve();
            });
        });
    });
}

function ingest_static_page(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const body = $('.aboutpage');
        const description = $('meta[property="og:description"]').attr('content');
        const read_more = 'Original Article at www.all-that-is-interesting.com';
        const title = 'About ATI';
        const url_thumb = $('.wp-post-image[itemprop="image"]').first().attr('src');
        const today = new Date();
        const author = 'ATI';

        // body clean
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find('iframe').parent().remove();
        body.find(REMOVE_ATTR.join(',')).get().map((tag) => clean_attr(tag));

        // download thumbnail
        let thumbnail;
        if (url_thumb) {
            const url_obj = url.parse(url_thumb);
            const src = url.resolve(url_obj.href, url_obj.pathname);
            const image = libingester.util.download_image(src);
            image.set_title(title);
            asset.set_thumbnail(thumbnail = image);
            hatch.save_asset(thumbnail);
        }

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
            hatch.save_asset(image);
        });

        // article settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.set_date_published(today);
        asset.set_last_modified_date(today);
        asset.set_read_more_text(read_more);
        asset.set_synopsis(description);
        asset.set_tags([]);
        asset.set_as_static_page();
        asset.set_title(title);
        asset.render();
        hatch.save_asset(asset);
    });
}

function process_static_pages() {
    const STATIC_PAGES = [
        'http://all-that-is-interesting.com/about-all-that-is-interesting',
    ];

    const hatch = new libingester.Hatch('all-that-is-interesting', 'en');
    Promise.all(STATIC_PAGES.map(uri => ingest_static_page(hatch, uri)))
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}


function main() {
    if (process.argv.includes('--static-pages')) {
        process_static_pages();
        return;
    }

    const hatch = new libingester.Hatch('all-that-is-interesting', 'en');

    const feed = libingester.util.create_wordpress_paginator(RSS_URI);

    libingester.util.fetch_rss_entries(feed, 20, 200).then(items => {
         return Promise.all(items.map((item) => ingest_post(hatch, item.link))).then(() => {
            return hatch.finish();
        }).catch((err) => console.log(err));
    });
}

main();
