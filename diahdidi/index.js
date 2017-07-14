'use strict';

const libingester = require('libingester');
const url = require('url');

// const BASE_URI = "http://www.diahdidi.com";
const RSS_FEED = 'http://feeds.feedburner.com/blogspot/LNjea';

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'a[name="more"]',
    'iframe',
    'script',
    'video',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'data-original-height',
    'data-original-width',
    'data-srcset',
    'figure',
    'height',
    'lang',
    'rel',
    'style',
    'width',
    'class'
];

// clean attr (tag)
const CLEAN_ELEMENTS = [
    'a',
    'b',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'i',
    'img',
    'p',
    'span',
    'ul',
    'li'
];

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then($ => {
        const canonical_uri = $('link[rel=\'canonical\']').attr('href');
        const body = $('.post-body').first().attr('id', 'mybody');
        const asset = new libingester.BlogArticle();
        const title = item.title;
        const modified_date = new Date(Date.parse(item.date));
        const author = item.author;
        const synopsis = $('meta[property=\'og:description\']').attr('content');
        const tags = $('.post-labels a').map((i,elem) => $(elem).text()).get();
        const url_thumb = item.image.url;
        let thumbnail;

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag, tag_name = 'div') => {
            let current = elem, parent = $(elem).parent()[0];
            while (parent) {
                if (id_main_tag) {
                    const attr = parent.attribs || {};
                    if (attr.id == id_main_tag) {
                        return current;
                    } else {
                        current = parent;
                        parent = $(current).parent()[0];
                    }
                } else {
                    if (parent.name == tag_name) {
                        return parent;
                    } else {
                        parent = $(parent).parent()[0];
                    }
                }
            }
            return undefined;
        }

        // fix the image, add figure and figcaption
        const fix_img_with_figure = (replace, src, alt = '', find_caption) => {
            if (src && replace) {
                let figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                if (find_caption) find_caption(figure); // callback function
                $(replace).replaceWith(figure);
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // fixed images, add figure
        body.find('div img').map((i,elem) => {
            const wrapp = find_first_wrapp(elem, undefined);
            fix_img_with_figure(wrapp, $(elem).attr('src'));
        });

        // conver div to p
        body.find('div').map((i,elem) => elem.name = 'p');

        // sacar figure de los p
        body.children().find('p>figure').map((i,elem) => $(elem).insertAfter($(elem).parent()));

        // fixed blockquote content
        body.find('blockquote.tr_bq').map((i,elem) => {
            console.log(title+': blockquote');
            const span = $(elem).find('span').first()[0];
            if (span) {
                $(elem).replaceWith(`<aside><p>${$(elem).html()}</p></aside>`);
            } else {
                elem.name = 'aside';
                delete elem.attribs;
                $(elem).find('p>b').map((i,b) => {
                    $(b).parent().replaceWith(`<p><em>${$(b).text()}</em></p>`);
                });
            }
        });

        // delete br, and add wrapp 'p' to lost text
        let lost_p = $('<p></p>');
        let first_br = false;
        body.contents().filter((i,elem) => {
            if (elem.name == 'br') {
                if (lost_p.text().trim() != '' && !first_br) {
                    // append the new paragraph to the body
                    $(elem).replaceWith(lost_p.clone());
                    lost_p = $('<p></p>');
                    first_br = true;
                } else {
                    $(elem).remove(); // if the 'br' is not replaced, then we eliminate it
                }
            } else if ($(elem).text().trim() != '' && elem.type == 'text') {
                lost_p.append(elem); // if there is text, we add it
                first_br = false;
            } else if (elem.name != 'aside'){
                $(elem).find('br').remove();
            }
        });

        // Pull out the main image
        const set_main_image = (first_figure) => {
            const src = $(first_figure).find('img').first().attr('src');
            const main_image = libingester.util.download_image(src);
            main_image.set_title(title);
            asset.set_main_image(main_image);
            asset.set_thumbnail(thumbnail = main_image);
            hatch.save_asset(main_image);
            $(first_figure).remove();
        }
        // This 'while' omits empty elements before the 'figure'
        let first_figure = body.children()[0];
        while (first_figure) {
            if (first_figure.name == 'figure') {
                set_main_image(first_figure);
                break;
            } else if ($(first_figure).text().trim() == '') {
                first_figure = $(first_figure).next()[0];
            } else {
                break;
            }
        }

        // download images
        body.find('img').map(function() {
            const image = libingester.util.download_img($(this));
            image.set_title(title);
            hatch.save_asset(image);
            this.attribs["data-libingester-asset-id"] = image.asset_id;
        });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        clean_tags(body.find(CLEAN_ELEMENTS.join(',')));
        body.find('p, li').filter((i,elem) => $(elem).text().trim() === '').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // Article Settings
        console.log(title, canonical_uri);
        asset.set_canonical_uri(canonical_uri);
        asset.set_last_modified_date(modified_date);
        asset.set_title(title);
        asset.set_synopsis(synopsis);
        asset.set_author(author);
        asset.set_date_published(modified_date);
        asset.set_license('Proprietary');
        asset.set_body(body);
        asset.set_tags(tags);
        asset.set_read_more_text('Artikel asli di www.diahdidi.com');
        asset.set_custom_scss(`
            $body-font: Lato;
            $title-font: Raleway;
            $primary-light-color: #729fcf;
            $primary-dark-color: #204a87;
            $accent-light-color: #8ae234;
            $accent-dark-color: #4e9a06;
            $background-light-color: #eeeefc;
            $background-dark-color: #888a95;
            @import '_default';
        `);

        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        console.log(item.link, err);
    });
}

const item = {
    title: 'Prueba',
    date: '2017-06-17T01:36:00.190Z',
    link: 'http://www.diahdidi.com/2017/07/tepung-leker.html',
    author: 'author',
    image: {url: 'https://2.bp.blogspot.com/-AC4-nyvBovM/WUfTSU0MYtI/AAAAAAAAbj4/Mf1kZE10tuMzB61pBBU6n8aQdt_AU4Z7gCLcBGAs/s72-c/A%2BKASTENGEL%2BNEW%2B4-01-01-01.jpeg'},
    categories: [ 'Kue Kering Lebaran', 'Recipes' ],
}

function main() {
    const hatch = new libingester.Hatch('diahdidi', 'in');
    const max_posts = parseInt(process.argv[2]) || 20;
    const days_old = parseInt(process.argv[3]) || 50;

    // ingest_article(hatch, item).then(() => hatch.finish());

    libingester.util.fetch_rss_entries(RSS_FEED, max_posts, days_old).then(items => {
        // items.map(item => console.log(item.link));
        return Promise.all(items.map(item => ingest_article(hatch, item)))
            .then(() => hatch.finish());
    })
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
