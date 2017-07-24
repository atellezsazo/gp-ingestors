'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://primer.com.ph';
const RSS_URI = 'http://primer.com.ph/blog/feed/';

// max number of links per category
const MAX_LINKS = 5;

const CATEGORY_LINKS = [
    'http://primer.com.ph/blog/2017/', //Home
    'http://primer.com.ph/feature/', //Featured
    'http://primer.com.ph/food/', //Food
    'http://primer.com.ph/beauty-fashion/', //beauty & fashion
    'http://primer.com.ph/travel/', //travel
    'http://primer.com.ph/study/', //study
    'http://primer.com.ph/business/',//business
    'http://primer.com.ph/event/',//event
    'http://primer.com.ph/tips-guides/'//tips-guides

];

/** delete duplicated elements in array **/
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

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
    'style',
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

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.BlogArticle();
        const body = $('.single-content').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[property="og:description"]').attr('content');
        const modified_date = new Date(Date.parse($('.cat-date').first().text()));
        const section ='Article';
        const page = 'Primer';
        const read_more = 'Read more at www.primer.com.ph';
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');
        const tags = $('meta[name="keywords"]').attr('content').split(",");

        // Pull out the main image
        if (uri_main_image) {
            const main_img = libingester.util.download_image(uri_main_image);
            main_img.set_title(title);
            hatch.save_asset(main_img);
            asset.set_thumbnail(main_img);
        }

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
            if (figcaption.name=='span' || figcaption.name=='em') {
                img.append($(`<figcaption><p>${$(figcaption).text()}</p></figcaption>`));
                $(figcaption).remove();
            }
            else {
                const parent = $(this).parent().next();
                const span = parent.find('span').first()[0] || {attribs: {}};
                if (span.attribs.style=='font-size: 10pt') {
                    img.append($(`<figcaption><p>${$(span).text()}</p></figcaption>`));
                    parent.remove();
                }
            }
            const image = libingester.util.download_img($(img.children()[0]));
            $(this).replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
       });
       //Replace p with figure
       body.find('p figure').map(function(){
           const parent = $(this).parent();
           if (parent[0].name=='p') {
               parent.replaceWith($(this));
           }
       });

       body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
       body.find('p').filter((i,elem) => $(elem).is(':empty')).remove(); //Cleaning empty paragraph

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
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_article(hatch, uri);
        }
    });
}

function _fetch_all_links(links, max) {
    let all_links = []; // all links retrieved from all categories
    return Promise.all(links.map(link => libingester.util.fetch_html(link).then($ => {
        const links = $('.carticle-title a').map((i,a) => a.attribs.href).get().slice(0, max);
        all_links = all_links.concat(links);
    }))).then(() => all_links.unique()); // before sending, repeated links are removed
}

function main() {
    const hatch = new libingester.Hatch('primer', 'en');
    _fetch_all_links(CATEGORY_LINKS, MAX_LINKS).then(links => {
        return Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
