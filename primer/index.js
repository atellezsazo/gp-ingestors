'use strict';

const libingester = require('libingester');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const url = require('url');
const xml2js = require('xml2js');

const BASE_URI = 'http://primer.com.ph/blog/2017/';
const RSS_URI = 'http://primer.com.ph/blog/feed/';

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'div',
    'h2',
    'h6',
    'hr',
    'iframe',
    'noscript',
    'script',
    'style',
    '.cat-meta',
    '.cat-header',
    '.single-siteurl',
    '.lifestyle-in-content',
    '.link-pagging-warper',
    '.paging-related',
    '.video-wrapper'
];

// clean attr (tag)
const REMOVE_ATTR = [
    'class',
    'height',
    'id',
    'sizes',
    'srcset',
    'style',
    'width'
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'i',
    'img',
    'span',
    'table',
];

const CUSTOM_CSS = `
$primary-light-color: #06B0EF;
$primary-medium-color: #056F96;
$primary-dark-color: #3A3A3A;
$accent-light-color: #FAD213;
$accent-dark-color: #E14163;
$background-light-color: #FAFAFA;
$background-dark-color: #EBEBEB;

$title-font: 'Lato';
$body-font: 'Lato';
$display-font: 'Lato';
$logo-font: 'Lato';
$context-font: 'Lato';
$support-font: 'Lato';

@import '_default';
`;

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then(($) => {

        const asset = new libingester.BlogArticle();
        const body = $('.single-content').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[property="og:description"]').attr('content');
        const modified_date = new Date(item.pubdate);
        const section ='Article';
        const page = 'Primer';
        const read_more = 'Read more at www.primer.com.ph';
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');
        const tags = item.categories;

        // Pull out the main image
        if (uri_main_image) {
            const main_img = libingester.util.download_image(uri_main_image);
            main_img.set_title(title);
            hatch.save_asset(main_img);
            asset.set_thumbnail(main_img);
        }

        body.find('p img').map(function(){
            const span=$(this).next()[0] || {};
            if(span.name=='span'){
                $(span).insertAfter($(this).parent());
            }
            $(this).insertAfter($(this).parent());

        });

        // download video
        body.find('iframe').map(function() {
            const src = this.attribs.src;
            if (src.includes("youtube")) {
                const video = libingester.util.get_embedded_video_asset($(this), src);
                video.set_title(title);
                hatch.save_asset(video);
            }
        });

        //download facebook video
        body.find('#fb-root').map(function(){
            let video_title= $(this).prev();
            let fb_video=$(this).next().next().attr('data-href');
            video_title.replaceWith($(`<a href="${fb_video}">${video_title.text()}</a>`));
        });

        //clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
        body.find('p').filter((i,elem) => $(elem).is(':empty')).remove(); //Cleaning empty paragraph

        let author = $('meta[name="author"]').attr('content');
        let info_trash = body.find('p').last()[0];
        if (info_trash) {
            const text = $(info_trash).find('em').first().text();
            if (text.includes('Written by:')) {
                author=text.replace('Written by:','');
            }
            $(info_trash).remove();
        }

       // download images
       body.find('img').map(function() {
           let img = $('<figure></figure>').append($(this).clone());
           let figcaption = $(this).next()[0] || {};
           if (figcaption.name == 'span') {
               img.append($(`<figcaption><p>${$(figcaption).text()}</p></figcaption>`));
               $(figcaption).remove();
           }
           const image = libingester.util.download_img($(img.children()[0]));
           $(this).replaceWith(img);
           image.set_title(title);
           hatch.save_asset(image);
       });

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

    // wordpress pagination
    const feed = libingester.util.create_wordpress_paginator(RSS_URI);
    const hatch = new libingester.Hatch('primer', 'en');
    libingester.util.fetch_rss_entries(feed, 20, 100).then(rss => {
             Promise.all(rss.map(item => ingest_article(hatch, item)))
                     .then(() => hatch.finish());
        }).catch((err) => {
            console.log('Error '+err);
         });
}

main();
