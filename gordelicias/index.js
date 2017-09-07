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
    'iframe',
    'style',
    '.share-button',
    'input',
    '.abh_box',
    '.tags-links',
    'meta',
    'svg',
    '.vcard',
    '.abh_posts_tab',
    '.abh_box',
    '.wprm-recipe-image-container'
];

const CUSTOM_CSS = `
$primary-light-color: #DDA181;
$primary-medium-color: #333333;
$primary-dark-color: #252A2B;
$accent-light-color: #DDA181;
$accent-dark-color: #238E93;
$background-light-color: #F5F5F5;
$background-dark-color: #ECECEC;
$title-font: 'Lato';
$body-font: 'Lato';
$display-font: 'Lato';
$context-font: 'Lato';
$support-font: 'Lato';
h1,h2{
font-weight:300;
}
h3,h4{
font-weight:400;
}
@import '_default';
`;

function clean_title(title) {
    return title.replace('- gordelícias','').trim();
}

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then($ => {
        const page_title = $('title').first().text() || '#';
        // console.log(item.link);
        // console.log(page_title);
        // if (page_title.includes('Page not found')) {
        //     console.log('page not found: '+item.link);
        //     return;
        // }

        const asset = new libingester.BlogArticle();
        const body = $('.entry-content').first().attr('id', 'mybody');
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
        let thumbnail;

        body.find('img').map((i,elem) => {
          if ($(elem).attr('src') == 'http://gordelicias.biz/wp-content/uploads/2017/08/bolinho-carne3.jpg') {
            console.log(item.link);
            console.log(title);
          }
        })

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag) => {
            let current = elem;
            let parent = $(current).parent()[0];
            while (parent) {
                if ($(parent).attr('id') == id_main_tag) {
                    return current;
                } else {
                    current = parent;
                    parent = $(current).parent()[0];
                }
            }
        }

        // remove elements
        const clean_attr = (elem) => REMOVE_ATTR.forEach(attr => $(elem).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        // clean tags
        body.find(CLEAN_TAGS.join(',')).map((i,elem) => clean_attr(elem));

         // fixed all 'divs'
        const fix_divs = (div = body.children().find('div>div').first()) => {
             if (div[0]) {
                 const parent = $(div).parent();
                 $(parent).children().insertBefore(parent);
                 fix_divs(body.children().find('div>div').first());
             }
        }
        fix_divs();

        // Pull out the main image
        if (uri_main_image) {
             const main_img = libingester.util.download_image(uri_main_image);
             main_img.set_title(title);
             hatch.save_asset(main_img);
             asset.set_thumbnail(thumbnail = main_img);
        }

        // download images
        body.find('img').map(function() {
            let img = $('<figure></figure>').append($(this).clone());
            const image = libingester.util.download_img($(img.children()[0]));
            image._image_data.then(() => {
              if (!image._content_type.includes('image')) {
                image._image_data = undefined;
              }
              console.log('AAA');
              console.log(image._canonical_uri);
              console.log(image._content_type);
            });
            $(this).parent().replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
        });

        body.find('div').map((i,elem) => {
            elem.name='p';
        });

        body.find('p>ol, p>ul').map((i,elem) => {
            $(elem).parent().replaceWith(elem);
        });

        // download videos
        body.find('video').map((i,elem) => {
            const src = $(elem).attr('src');
            const tag = find_first_wrapp(elem, body.attr('id'));
            const video = libingester.util.get_embedded_video_asset($(tag), src);
            video.set_title(title);
            video.set_thumbnail(thumbnail);
            hatch.save_asset(video);
        });

        // wrapp videos
        body.find('a.media-link').map((i,elem) => {
            const figure = $('<figure></figure>').append($(elem).clone());
            $(elem).replaceWith(figure);
        });

        // delete spaces and special characters "&#xA0;"
        body.find('div, p, span').filter((i,elem) => $(elem).text().trim() === '').remove();
        body.find('center').remove();
        // console.log(body.html());
        // Article Settings
        // console.log('processing', title);
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
    const feed = libingester.util.create_wordpress_paginator(RSS_URI);
    const hatch = new libingester.Hatch('gordelicias', 'pt');
    const numPost = parseInt(process.argv[2]) || Infinity; // in test is 20
    const oldDays = parseInt(process.argv[3]) || 1; // in test is 60

    libingester.util.fetch_rss_entries(feed, numPost, oldDays).then(rss => {
        let other = [];
        for (const item of rss) {
          if (item.link == 'http://gordelicias.biz/index.php/2017/08/02/bolinho-de-carne-moida-assado/') {
            other.push(item);
          }
        }
        rss = other;
        return Promise.all(rss.map(item => ingest_article(hatch, item)))
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
