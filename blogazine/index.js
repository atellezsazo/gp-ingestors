'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'https://blogazine.pub/';
const RSS_URI = 'https://blogazine.pub/blog/feed';

const CLEAN_TAGS = [
    'a',
    'i',
    'p',
    'span',
];

const REMOVE_ATTR = [
    'style',
    'dir',
    'id',
];

/**
 * ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The object with the metadata of post
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.BlogArticle();
        const author = $('.submitted a.username').first().text();
        const body = $('.field-name-body .field-item').first().attr('id','mybody');
        const cover = $('#zone-user-wrapper .region-inner style').first();
        const cover2 = $('article .field-name-field-blog-cover img').first().attr('src');
        const date = $('footer.submitted').text().trim().split('-')[0];
        const section = "Article";
        const title = $('h1[id="page-title"]').text();
        const categories = $('ul.links li a').map((i,a) => $(a).text()).get();
        const description = 'aaaaa';
        const modified_date = new Date(date);
        const read_more = 'อ่านเพิ่มเติมที่ www.blogazine.pub';
        let thumbnail;

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag) => {
            let current = elem;
            let parent = $(current).parent()[0];
            while (parent) {
                const attr = parent.attribs || {};
                if (attr.id == id_main_tag) {
                    return current;
                } else {
                    current = parent;
                    parent = $(current).parent()[0];
                }
            }
        }

        // fix the image, add figure and figcaption
        const fix_img_with_figure = (replace, src, alt = '', search_caption, find_caption) => {
            if (src && replace) {
                let figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                let caption = [];
                // finding figcaption by search_caption or callback function (find_caption)
                if (find_caption) {
                    caption = find_caption();
                } else if (search_caption) {
                    caption = $(replace).find(search_caption).first();
                }
                // if found.. add to figure
                if (caption[0]) {
                    figure.append(`<figcaption><p>${caption.html()}</p></figcaption>`);
                }
                // replace and return
                $(replace).replaceWith(figure);
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // find the last child Example: "div>div>span" return span
        const find_the_last_child = (parent) => {
            if (parent.name == 'p') return parent;
            const child = $(parent).children().get();
            if (child.length == 1) {
                return find_the_last_child(child[0]);
            } else {
                return parent;
            }
        }

        // get uri background image
        let uri_thumb = cover.text();
        uri_thumb = uri_thumb.substring(uri_thumb.indexOf('background:url(')+15);
        uri_thumb = uri_thumb.substring(0,uri_thumb.indexOf(')'));
        uri_thumb = url.resolve(BASE_URI, uri_thumb);
        if (uri_thumb == BASE_URI) uri_thumb = cover2;

        // download main image
        if (uri_thumb) {
            const main_image = libingester.util.download_image(uri_thumb);
            main_image.set_title(title);
            hatch.save_asset(main_image);
            asset.set_main_image(main_image);
            asset.set_thumbnail(thumbnail = main_image);
        }

        // delete spaces and special characters "&#xA0;"
        const trim = (str) => str.replace(new RegExp('&#xA0;','g'),' ').trim();

        // fixed all 'divs'
        const fix_divs = (div = body.children().find('div>div').first()) => {
            if (div[0]) {
                const parent = $(div).parent();
                $(parent).children().insertBefore(parent);
                fix_divs(body.children().find('div>div').first());
            }
        }
        fix_divs();

        // convert 'tag' to 'p'
        body.contents().filter((i,elem) => elem.type == 'tag').map((i,elem) => elem.name = 'p');

        // convert 'p>strong' to 'h2'
        body.find('p>strong').map((i,elem) => {
            const parent = $(elem).parent();
            const text = $(elem).text().trim();
            if (parent.text().trim() == text && text.length < 100) {
                parent.replaceWith(`<h2>${$(elem).text().trim()}</h2>`);
            }
        });

        // delete wrapp span
        body.find('p>span').map((i,elem) => {
            const parent = $(elem).parent();
            if (parent.text().trim() == $(elem).text().trim()) {
                parent.replaceWith(`<p>${trim($(elem).html())}</p>`);
            }
        });

        // clean attributes
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
        body.find(CLEAN_TAGS.join(',')).map((i,elem) => clean_attr(elem));

        // download images
        body.find('img').map((i,elem) => {
            let src = elem.attribs.src;
            let alt = elem.attribs.alt;
            const q_uri = url.parse(src);
            if (!q_uri.host) {
                src = url.resolve(uri, src);
            }
            // finding figcaption and convert to figure
            const wrapp = find_first_wrapp(elem, body.attr('id'));
            const figure = fix_img_with_figure(wrapp, src, alt, undefined, () => {
                const span = $(wrapp).find('span').first();
                const caption = $('<p></p>');
                let next;

                if (span[0]) { // first structure
                    caption.append(trim(span.html()));
                } else { // second structure
                    next = $(wrapp).next();
                    next.contents().filter((i,elem) => elem.name == 'span').map((i,span) => {
                        if ($(span).text().trim() != '') {
                            caption.append(trim($(span).html()));
                        }
                    });
                }

                if (caption.text().trim() === '') return [];
                if (next) next.remove();
                return caption;
            });
            // download image into figure
            if (figure) {
                const image = libingester.util.download_img($(figure.children()[0]));
                image.set_title(title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            }
        });

        // conver text in div's to paragraphs
        let new_body = $('<div></div>'); // new body cleaned

        // convert all to 'text' and append to new_body
        const append_body = (div) => {
            const last_child = $(find_the_last_child(div));
            const children = last_child.children().get();
            if (last_child.text().trim() != '' && children.length == 0) {
                new_body.append(`<p>${last_child.html()}</p>`);
            } else if (children.length > 0) {
                for (const new_div of children) {
                    append_body(new_div);
                }
            }
        }

        // delete div's and convert to 'p'
        body.contents().map((i,elem) => {
            if (elem.name == 'div') {
                append_body(elem);
            } else if (elem.type == 'tag'){
                new_body.append(elem);
            }
        });

        // delete br, and add wrapp 'p' to lost text
        const convert_p = (master_tag, take_out=False) => {
            let lost_p = $('<p></p>');
            let first_br = false;
            let element;
            $(master_tag).contents().filter((i,elem) => {
                element = elem;
                if (elem.name == 'br') {
                    if (lost_p.text().trim() != '' && !first_br) {
                        // append the new paragraph to the body
                        if (take_out) {
                            lost_p.clone().insertBefore(master_tag);
                        } else {
                            $(elem).replaceWith(lost_p.clone());
                        }
                        lost_p = $('<p></p>');
                        first_br = true;
                    } else {
                        $(elem).remove(); // if the 'br' is not replaced, then we eliminate it
                    }
                } else if ($(elem).text().trim() != '') {
                    lost_p.append(elem); // if there is text, we add it
                    first_br = false;
                }
            });
            // append lasts p
            if (lost_p.text().trim() != '') {
                if (take_out) {
                    lost_p.clone().insertBefore(master_tag);
                } else {
                    $(element).replaceWith(lost_p.clone());
                }
            }
        }

        // fixed paragraphs
        new_body.contents().filter((i,elem) => elem.name == 'p').map((i,p) => {
            const br = $(p).find('br').get();
            if (br.length > 0) convert_p(p, true);
        });

        // remove empty tags
        new_body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_author(author);
        asset.set_body(new_body);
        asset.set_tags(categories);
        asset.set_title(title);
        asset.set_synopsis(description);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_text(read_more);
        asset.set_custom_scss(`
            $primary-light-color: #212121;
            $primary-medium-color: #000000;
            $primary-dark-color: #212121;
            $accent-light-color: #F5018F;
            $accent-dark-color: #890050;
            $background-light-color: #FDFDFD;
            $background-dark-color: #EFEFEF;
            $title-font: 'Noto Serif';
            $body-font: 'Noto Sans UI';
            $display-font: 'Noto Sans UI';
            $logo-font: 'Noto Sans UI';
            $context-font: 'Noto Sans UI';
            $support-font: 'Noto Sans UI';
            @import '_default';
        `);

        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('blogazine', 'th');
    const days_old = parseInt(process.argv[2]) || 30;

    libingester.util.fetch_rss_entries(RSS_URI, 100, days_old).then(entries => {
        return Promise.all(entries.map(entry => ingest_article(hatch, entry.link)))
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
