'use strict';

const libingester = require('libingester');
//const Promise = require('bluebird');
const rss2json = require('rss-to-json');
const url = require('url');

const BASE_URI = 'https://www.duetdiary.com/';
const RSS_FEED = "http://www.duetdiary.com/feed/";

// Remove elements (body)
const REMOVE_ELEMENTS = [
    '.adsbygoogle',
    '.essb_links',
    'a[href="#"]',
    'iframe',
    'ins',
    'script',
    'video',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'height',
    'lang',
    'rel',
    'src',
    'style',
    'width',
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'b',
    'br',
    'div',
    'em',
    'i',
    'img',
    'span',
    'ul'
];

const CUSTOM_CSS = `
$primary-light-color: #009ADD;
$primary-medium-color: #156BA7;
$primary-dark-color: #002333;
$accent-light-color: #BE202E;
$accent-dark-color: #603A17;
$background-light-color: #F7F7F7;
$background-dark-color: #F2F2F2;

$title-font: 'Maitree';
$body-font: 'Prompt';
$display-font: 'Maitree';
$logo-font: 'Maitree';
$context-font: 'Prompt';
$support-font: 'Prompt';
`;
//
// /**
//  * ingest_article function
//  *
//  * @param {Object} hatch The Hatch object of the Ingester library
//  * @param {String} uri The URI of the post to ingest
//  * @returns {Promise} Returns a promise with the content of the post requested
//  */
//
//
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const base_uri = libingester.util.get_doc_base_uri($, uri);
        const asset = new libingester.BlogArticle();

        const author = $('.post-author').text();
        const body = $('.entry-content').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const description = $('meta[property="og:description"]').attr('content');
        const date = $('.post-date').first().text();
        const modified_date = new Date(Date.parse(date));
        const section ='Article';
        const read_more = 'Original Article at www.duetdiary.com';
        const title = $('meta[property="og:title"]').attr('content');
        const main_img = $('meta[property="og:image"]').attr('content');
        const tags = $('.tags a').map((i, elem) => elem.attribs.content).get();

        // Pull out the main image
        if (!main_img) { //problem with incomplete $
            throw { code: -1 };
        }

        const main_image = libingester.util.download_image(main_img, BASE_URI);
        main_image.set_title(title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image);
        //
        // const asset_main_image = libingester.util.download_image(url.resolve(BASE_URI, main_img), BASE_URI);
        // asset_main_image.set_title(post_title);
        // hatch.save_asset(asset_main_image);

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();



        // download images
        body.find('img').map(function() {
            this.attribs.src=url.resolve(BASE_URI,this.attribs.src);

            let img = $('<figure></figure>').append($(this).clone());
            const image = libingester.util.download_img(img.children());
            $(this).replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
            this.attribs["data-libingester-asset-id"] = image.asset_id;
        });

        // body.find('img').map(function() {
        //     const src = this.attribs.src;
        //         const image = libingester.util.download_img($(this), BASE_URI);
        //         image.set_title(title);
        //         hatch.save_asset(image);
        //         this.attribs['data-libingester-asset-id'] = image.asset_id;
        // });

        //clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find("img").get().map((tag) => clean_attr(tag));
        body.find('p').filter((i, elem) => $(elem).text().trim() === '').remove();

        // render content
        // const content = mustache.render(template.structure_template, {
        //     title: post_title,
        //     category: post_category,
        //     author: post_author,
        //     date_published: post_publishdate,
        //     main_image: asset_main_image,
        //     body: post_body.html(),
        //     post_tags: post_tags.join(', '),
        // });



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

// function main() {
//     const hatch = new libingester.Hatch('duetdiary', 'th');
//     rss2json.load(RSS_FEED, (err, rss) => {
//         const batch_links = rss.items.map(data => data.url);
//         return Promise.all(batch_links.map(uri) => ingest_article(hatch, uri))).then(() => {
//             console.log('finish');
//             return hatch.finish();
//         }).catch((err) => {
//             console.log('ingestor error: ', err);
//         });
//     });
// }

function main() {
    const hatch = new libingester.Hatch('duetdiary', 'th');
    rss2json.load(RSS_FEED, (err, rss) => {
        if (err) throw { code: -1, message: 'Error to load rss' }
        const links = rss.items.map(item => item.url);
        Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    });
}


main();
