'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://bk.asia-city.com/';

// clean tags
const CLEAN_TAGS = [
    'a',
    'figure',
    'h2',
    'li',
    'p',
    'span',
    'ul',
];

// remove metadata
const REMOVE_ATTR = [
    'class',
    'height',
    'id',
    'rscset',
    'sizes',
    'style',
    'width',
];

// remove elements
const REMOVE_ELEMENTS = [
    'div',
    'noscript',
    'script',
    'style',
];

const CUSTOM_SCSS = `
$primary-light-color: #3A95DC;
$primary-medium-color: #3B7098;
$primary-dark-color: #24231F;
$accent-light-color: #FCB900;
$accent-dark-color: #B5963B;
$background-light-color: #F8F8F8;
$background-dark-color: #F3F3F3;
$title-font: 'Taviraj';
$body-font: 'Kanit';
$display-font: 'Taviraj';
$logo-font: 'Taviraj';
$context-font: 'Kanit';
$support-font: 'Kanit';
@import '_default';
`;

/* delete duplicated elements in array */
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/** ingest_article
 *  @param {Object} hatch The Hatch object of the Ingester library
 *  @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const author = $('.author').first().text();
        const body = $('#dvPage').first();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const date = $('.published-date').first().text().trim();
        const slides = $('.slides').first();
        const categories = $('.entry-categories').first();
        const modified_date = date ? new Date(date) : new Date();
        const read_more = 'Read more at www.bk.asia-city.com';
        const section = $('meta[property="article:section"]').attr('content');
        const tags = ['ddd'];
        const title = $('meta[property="og:title"]').attr('content') || $('div.title').first().text();
        const subtitle = $('.teaser p').first().text();
        const synopsis = $('meta[name="description"]').attr('content');
        const url_thumb = $('.wp-post-image[itemprop="image"]').first().attr('src');
        let thumbnail;

        // clean body
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find('iframe').parent().remove();
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

        if (slides[0]) {
            const li = slides.find('li').get();
            if (li.length == 1) {
                const src = $(li[0]).find('img').first().attr('src');
                const main_image = libingester.util.download_image(src);
                const caption = $(li[0]).find('.caption-crp').first().text() || '';
                if (caption.trim() != '') asset.set_main_image_caption(caption);
                asset.set_main_image(main_image);
                asset.set_thumbnail(thumbnail = main_image);
                hatch.save_asset(main_image);
            } else {
                li.map(elem => {
                    elem.name = 'figure';
                    const caption = $(li[0]).find('.caption-crp').first();
                    if (caption[0]) {
                        const figcaption = $(`<figcaption><p>${caption.text()}</p></figcaption>`);
                        caption.replaceWith(figcaption);
                    }
                });
                body.prepend(slides.children());
            }
        }

        if (subtitle.trim() != '') {
            body.prepend($(`<p><i>${subtitle}</i></p>`));
        }

        // // download main image
        // let main_image, thumbnail;
        // if (url_thumb) {
        //     const url_obj = url.parse(url_thumb);
        //     const src = url.resolve(url_obj.href, url_obj.pathname);
        //     const image = libingester.util.download_image(src);
        //     image.set_title(title);
        //     asset.set_main_image(main_image = image);
        //     asset.set_thumbnail(thumbnail = image);
        //     hatch.save_asset(main_image);
        // }
        //
        // taking out the images of the paragraphs
        // body.find('img').map((i,elem) => {
        //     const parent = $(elem).parent();
        //     if (parent[0].name == 'p') {
        //         const figure = $('<figure></figure>').append($(elem).clone());
        //         figure.insertAfter(parent);
        //         $(elem).remove();
        //     }
        // });

        // download images
        body.find('img').map((i,img) => {
            img.attribs.src = url.resolve(BASE_URI, img.attribs.src);
            const image = libingester.util.download_img($(img));
            image.set_title(title);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            hatch.save_asset(image);
        });

        // clean empty tags
        body.find('h2, p').filter((i,elem) => $(elem).text().trim() === '').remove();

        // article settings
        console.log('processing', title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_canonical_uri(uri);
        asset.set_custom_scss(CUSTOM_SCSS);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_synopsis(synopsis);
        asset.set_tags(tags);
        asset.set_title(title);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        console.log(uri, err);
    });
}

function main() {
    const hatch = new libingester.Hatch('bk-asia-city', 'en');

    libingester.util.fetch_html(BASE_URI).then($ => {
        let all_links = [];
        // finding more recent links for each section
        $('.view-content').map((i, section) => {
            const links = $(section).find('.views-field-title a').map((i,a) => url.resolve(BASE_URI, a.attribs.href)).get();
            all_links = all_links.concat(links.slice(0,5));
        });
        all_links = all_links.unique();

        return Promise.all(all_links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    })
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
