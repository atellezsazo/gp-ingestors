'use strict';

const libingester = require('libingester');

const BASE_URI = 'http://gordelicias.biz/';
const RSS_URI = 'http://gordelicias.biz/index.php/feed/';

const CLEAN_TAGS = [
    'p',
    'span',
    'div',
    'h3',
    'h2',
    'mark',
    'img',
    'li',
    'ul',
    'ol'
];

// clean objects
const REMOVE_ATTR = [
    'class',
    'style',
    'width',
    'height',
    'data-soma-job-id',
    'data-soma-hint',
    'data-jpibfi-post-url',
    'sizes',
    'data-jpibfi-post-excerpt',
    'data-jpibfi-post-title',
    'data-jpibfi-src',
    'itemprop'
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'link',
    'noscript',
    'script',
    'style',
    '.share-button',
    'input',
    '.abh_box',
    '.tags-links',
    'meta',
    'svg'
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

function clean_title(title) {
    return title.replace('- gordelícias','').trim();
}

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then(($) => {

        const asset = new libingester.BlogArticle();
        const body = $('.entry-content').first();
        const author = $('h3.fn').text();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[property="og:description"]').attr('content');
        const modified_date = new Date(item.pubdate);
        const section ='Article';
        const page = 'Gordelicias';
        const read_more = 'Leia mais em www.gordelicias.biz';
        const title = clean_title($('meta[property="og:title"]').attr('content'));
        const uri_main_image = $('meta[property="og:image"]').attr('content');
        const tags = item.categories;

        // Pull out the main image
        if (uri_main_image) {
            const main_img = libingester.util.download_image(uri_main_image);
            main_img.set_title(title);
            hatch.save_asset(main_img);
            asset.set_thumbnail(main_img);
        }

               // remove elements
               const clean_attr = (elem) => REMOVE_ATTR.forEach(attr => $(elem).removeAttr(attr));
               body.find(REMOVE_ELEMENTS.join(',')).remove();
               // clean tags
         body.find(CLEAN_TAGS.join(',')).map((i,elem) => clean_attr(elem));


       // download images
       body.find('img').map(function() {
            let img = $('<figure></figure>').append($(this).clone());
            const image = libingester.util.download_img($(img.children()[0]));
            $(this).parent().replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
       });
    //    //Replace p with figure
    //    body.find('p figure').map(function(){
    //        const parent = $(this).parent();
    //        if (parent[0].name=='p') {
    //            parent.replaceWith($(this));
    //        }
    //    });
       //
       //

       body.find('div').filter((i,elem) => $(elem).text().trim() === '').remove();

    //    body.find('div.wprm-recipe>div').map((i,elem) => {
    //           $(elem).parent().replaceWith(elem);
    //    });

       body.find('div.wprm-recipe').map((i,elem) => {
           elem.find('div>p').map((i,p) => {
               $(p).parent().replaceWith(p);
           });
       });



    //    body.find('div').map((i,elem) => {
    //        elem.name='p';
    //    });
    //    body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

    //    console.log(body.html());

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
        console.log(err);
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_article(hatch, uri);
        }
    });
}

function main() {
    // wordpress pagination
    const feed = libingester.util.create_wordpress_paginator(RSS_URI);
    const hatch = new libingester.Hatch('gordelicias', 'pt');

    const item = {
        link:'http://gordelicias.biz/index.php/2017/05/19/arroz-de-bacalhau/',
        pubdate:'2017-06-28T08:47:48.000Z',
        categories : [ 'News & Current Events',
       'airlines',
       'all nippon airways',
       'awards',
       'Japan',
       'skytrax' ]
    }
    ingest_article(hatch,item)
    .then(()=> hatch.finish()
    );

    //
    // libingester.util.fetch_rss_entries(feed, 20, 100).then(rss => {
    //         // console.log(rss.link);
    //          return Promise.all(rss.map(item => ingest_article(hatch, item)))
    //                  .then(() => hatch.finish());
    //     }).catch((err) => {
    //         console.log('Error ',err);
    //      });
}

main();
