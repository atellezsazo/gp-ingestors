'use strict';

const libingester = require('libingester');

const FEED_RSS = 'http://www.hipwee.com/feed/'; // recent articles

const CUSTOM_CSS = `
$primary-light-color: #E3A840;
$primary-medium-color: #575C62;
$primary-dark-color: #3D3B41;
$accent-light-color: #FFA300;
$accent-dark-color: #E59200;
$background-light-color: #F6F6F6;
$background-dark-color: #F0F0F0;
$title-font: 'Roboto';
$body-font: 'Roboto';
$display-font: 'Roboto';
$context-font: 'Roboto Slab';
$support-font: 'Roboto';

@import "_default";
`;

// elements to remove
const REMOVE_ELEMENTS = [
    'banner',
    'iframe',
    'noscript',
    'script',
    '.fb-like-box',
    '.instagram-media',
    '.imgur-embed-pub',
    '.helpful-article',
    '.single-share',
];

// attributes to remove
const REMOVE_ATTR = [
    'class',
    'data-alt',
    'data-src',
    'data-wpex-post-id',
    'height',
    'id',
    'sizes',
    'srcset',
    'width',
];

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then($ => {
        const asset = new libingester.NewsArticle();
        const body = $('.post-content').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const copyright = $('.copyright').first().text();
        const description = $('meta[name="description"]').attr('content');
        const first_p = body.find('p').first();
        const page = 'hipwee';
        const read_more = `Baca lebih lanjut di <a href="${canonical_uri}">${page}</a>`;
        const section = $('meta[property="article:section"]').attr('content');
        const main_img = $('.post-image').first();

        // article settings
        asset.set_authors([item.author]);
        asset.set_body(body);
        asset.set_canonical_uri(canonical_uri);
        asset.set_date_published(item.pubDate);
        asset.set_last_modified_date(item.pubDate);
        asset.set_license(copyright);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(description);
        asset.set_title(item.title);
        asset.set_custom_scss(CUSTOM_CSS);

        // pull out the main image
        const uri_main_image = main_img.find('img').first().attr('data-src');
        const image_credit = main_img.find('.image-credit').first().children();
        const main_image = libingester.util.download_image(uri_main_image);
        main_image.set_title(item.title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image, image_credit);

        // set first paragraph of the body
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);

        // remove and clean elements
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));

        //Download images
        body.find('img').map(function() {
            const src = this.attribs.src || this.attribs['data-src'] || '';
            if (src.includes('http')) {
                this.attribs['src'] = src;
                this.attribs['alt'] = this.attribs['data-alt'];
                clean_attr(this);
                let figcaption = "";
                if ($(this).next('p').attr('class') == 'wp-caption-text') {
                    figcaption = $("<figcaption><p>" + $(this).next('p') + "</p></figcaption>");
                    $(this).next('p').remove();
                }
                let img = $('<figure></figure>').append($(this).clone(), figcaption);
                const image = libingester.util.download_img(img.children());
                $(this).replaceWith(img);
                image.set_title(item.title);
                hatch.save_asset(image);
            } else {
                $(this).remove();
            }
        });

        // download video
        body.find('iframe').map(function() {
            const src = this.attribs.src;
            if (src.includes("youtube")) {
                const video = libingester.util.get_embedded_video_asset($(this), src);
                video.set_title(item.title);
                video.set_thumbnail(main_image);
                hatch.save_asset(video);
            }
        });

        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(first_p).remove();
        body.find('div').map((i, elem) => clean_attr(elem));
        body.find('p, h3, div').filter(function() {
            return $(this).text().trim() === '' && $(this).children().length === 0;
        }).remove();

        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err.stack);
    });
}

function main() {
    // Generally, we only want the last 24 hours worth of content, but allow
    // this to be modified
    let MAX_DAYS_OLD = 1;
    if (process.env.MAX_DAYS_OLD)
        MAX_DAYS_OLD = parseInt(process.env.MAX_DAYS_OLD);

    // wordpress pagination
    const feed = libingester.util.create_wordpress_paginator(FEED_RSS);

    const hatch = new libingester.Hatch('hipwee', 'id');
    libingester.util.fetch_rss_entries(feed, 100, MAX_DAYS_OLD).then(rss => {
            console.log(`Ingesting ${rss.length} articles...`);
            return Promise.all(rss.map(entry => ingest_article(hatch, entry)));
        })
        .then(() => hatch.finish())
        .catch(err => {
            console.log(err);
            // Exit without cutting off pending operations
            process.exitCode = 1;
        });
}

main();