'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://bk.asia-city.com/';

// clean tags
const CLEAN_TAGS = [
    'a',
    'figure',
    'h1',
    'h2',
    'li',
    'p',
    'span',
    'ul',
];

// remove metadata
const REMOVE_ATTR = [
    'align',
    'class',
    'dir',
    'height',
    'id',
    'rscset',
    'sizes',
    'style',
    'width',
];

// remove elements
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
];

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
        const author = $('.author').first(); // poner en array
        const body_pages = $('.cpages');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const date = $('.published-date').first().text().trim();
        const slides = $('.slides').first();
        const categories = $('.entry-categories').first();
        const modified_date = date ? new Date(date) : new Date();
        const read_more = 'Read more at www.bk.asia-city.com';
        const section = $('meta[property="article:section"]').attr('content');
        const tags = $('.node_terms li').map((i,elem) => $(elem).text()).get();
        const title = $('meta[property="og:title"]').attr('content') || $('div.title').first().text();
        const subtitle = $('.teaser p').first().text();
        const synopsis = $('meta[name="description"]').attr('content');
        const url_thumb = $('.wp-post-image[itemprop="image"]').first().attr('src');
        let body;
        let thumbnail;

        if (body_pages.get().length == 1) {
            body = $(body_pages.get()[0]);
        } else {
            body = $('<div id="dvPage"><div>');
            body_pages.map((i,elem) => {
                $(elem).contents().filter((i,elem) => elem.type == 'tag').map((i,elem) => {
                    body.append($(elem).clone());
                });
            });
        }

        // clean body
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find('iframe').parent().remove();

        // fixing "divs" into "divs" and into "divs" and ...
        const find = (tag) => {
            $(tag).contents().map((i,elem) => {
                if (elem.name == 'div') {
                    const child = $(elem).find('div').first()[0];
                    if (child) {
                        find(elem);
                    } else {
                        body.append($(elem).clone());
                        $(elem).remove();
                    }
                } else {
                    body.append($(elem).clone());
                    $(elem).remove();
                }
            });
        }
        find(body);

        // convert 'div' to 'p'
        body.contents().filter((i,elem) => elem.name == 'div').map((i,elem) => elem.name = 'p');

        // delete images into h1, h2, h3
        body.find('h1 img, h2 img, h3 img').remove();

        // fixed table promotion credit card
        body.find('table').map((i,elem) => {
            const p = $(elem).find('p').first();
            if (p.text().includes('Exclusively for Citi credit card members')) {
                const parent = $(elem).parent();
                if (parent[0].name == 'p') {
                    $(parent).replaceWith(`<p><i>${p.text()}</i></p>`);
                } else {
                    $(elem).replaceWith(`<p><i>${p.text()}</i></p>`);
                }
            }
        });

        // fix images, delete wrappers and add figure
        body.find('img').map((i,elem) => {
            let current = $(elem);
            let parent = $(elem).parent()[0];
            if (parent.name != 'figure') {
                while (parent) {
                    const attr = parent.attribs || {};
                    if (attr.id == 'dvPage') {
                        const figure = $(`<figure></figure>`).append($(elem).clone());
                        $(elem).remove();
                        figure.insertAfter(current);
                        break;
                    } else {
                        current = parent;
                        parent = $(parent).parent()[0];
                    }
                }
            }
        });

        // slides of images, insert to body
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
                    const caption = $(elem).find('.caption-crp').first();
                    if (caption[0]) {
                        const figcaption = $(`<figcaption><p>${caption.text()}</p></figcaption>`);
                        caption.replaceWith(figcaption);
                    }
                });
                body.prepend(slides.children());
            }
        }

        // add subtitle to body
        if (subtitle.trim() != '') {
            body.prepend($(`<p><i>${subtitle}</i></p>`));
        }

        // download images
        body.find('img').map((i,img) => {
            img.attribs.src = url.resolve(BASE_URI, img.attribs.src);
            clean_attr(img);
            const image = libingester.util.download_img($(img));
            image.set_title(title);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            hatch.save_asset(image);
        });

        // clean empty tags
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
        body.find('h2, p, strong, div').filter((i,elem) => $(elem).text().trim() === '').remove();
        body.contents().filter((i,elem) => elem.type === 'comment').remove();

        // fixing tag hr
        body.find('hr').map((i,elem) => {
            const parent = $(elem).parent();
            const next = $(elem).next().text() || '';
            if (parent[0].name == 'p') {
                if (next.trim() != '' ) {
                    $(elem).insertBefore(parent);
                } else {
                    $(elem).insertAfter(parent);
                }
            }
        });

        // fixing author
        let authors = 'BK Staff';
        if (author[0]) {
            const a = author.find('a');
            if (a.get().length >= 1) {
                authors = a.map((i,elem) => $(elem).text()).get();
            }
        }

        // article settings
        console.log('processing', title);
        asset.set_author(authors);
        asset.set_body(body);
        asset.set_canonical_uri(uri);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_synopsis(synopsis);
        asset.set_tags(tags);
        asset.set_title(title);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, uri);
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
