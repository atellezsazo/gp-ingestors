'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://www.justlia.com.br';
const RSS_URI = 'http://www.justlia.com.br/feed/atom/';

// clean tags
const CLEAN_TAGS = [
    'a',
    'div',
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
    'input',
    'noscript',
    'script',
    'style',
    '.batalha',
    '.rs-adblock',
];

const CUSTOM_SCSS = `
$primary-light-color:#CDB21A;
$primary-medium-color: #343434;
$primary-dark-color: #252A2B;
$accent-light-color: #F7839D;
$accent-dark-color: #FFB0B7;
$background-light-color: #FAFAFA;
$background-dark-color: #9EA2A3;
$highlighted-background-color: transparentize($accent-light-color, 1-0.10);
$title-font: 'Metropolis';
$body-font: 'Raleway';
$display-font: 'Metropolis';
$context-font: 'Metropolis';
$support-font: 'Raleway';
h1{text-transform:uppercase;}
@import '_default';
`;

/** ingest_article
 *  @param {Object} hatch The Hatch object of the Ingester library
 *  @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then($ => {
        const asset = new libingester.BlogArticle();
        const body = $('.conteudo-post-texto').first().attr('id','mybody');
        const description = $('meta[property="og:description"]').attr('content');
        const read_more = 'Leia mais em www.justlia.com.br';
        const title = $('.conteudo-post h1').first().text() || item.title;
        const url_thumb = $('meta[property="og:image"]').attr('src');
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

        // resolve the thumbnail from youtube
        const get_url_thumb_youtube = (embed_src) => {
            const thumb = '/maxresdefault.webp';
            const base_uri_img = 'https://i.ytimg.com/vi_webp/';
            const uri = url.parse(embed_src);
            if (uri.hostname === 'www.youtube.com' && uri.pathname.includes('/embed/')) {
                const path = uri.pathname.replace('/embed/','') + thumb;
                return url.resolve(base_uri_img, path);
            }
        }

        // fix the image, add figure and figcaption (caption: String, search_caption: String, find_caption: function)
        const fix_img_with_figure = (replace, src, alt = '', to_do = 'replace', caption, search_caption, find_caption) => {
            if (src && replace) {
                let figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                let figcaption = $(`<figcaption></figcaption>`);
                // finding figcaption by search_caption or callback function (find_caption)
                if (typeof caption == 'string') {
                    figcaption.append(`<p>${caption}</p>`);
                } else if (find_caption) {
                    const cap = find_caption();
                    figcaption.append(`<p>${cap.html()}</p>`);
                } else if (search_caption) {
                    const cap = $(replace).find(search_caption).first();
                    figcaption.append(`<p>${cap.html()}</p>`);
                }
                // if found.. add to figure
                if (figcaption.text().trim() != '') {
                    figure.append(figcaption);
                }
                // replace or insert and return
                switch (to_do) {
                    case 'replace': { $(replace).replaceWith(figure); break; }
                    case 'after': { figure.insertAfter(replace); break; }
                    case 'before': { figure.insertBefore(replace); break; }
                }

                if (to_do != 'replace') figure = body.find(`figure img[src="${src}"]`).parent();
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // function for save image asset: return ImageAsset
        const save_image_asset = (image_asset, img_title) => {
            image_asset.set_title(img_title);
            hatch.save_asset(image_asset);
            return image_asset;
        }

        // remove online shopping
        body.find('.shopthepost-widget').map((i,elem) => {
            const prev = $(elem).prev();
            $(elem).remove();
            if (prev[0].name == 'h2') prev.remove();
        });

        // fix gallery images (slide)
        body.find('.galeria').map((i,elem) => {
            $(elem).find('.galeria-thumbs').remove();
            $(elem).find('img').map((i,img) => {
                const src = $(img).attr('src');
                const alt = $(img).attr('alt');
                fix_img_with_figure(elem, src, alt, 'before');
            });
            $(elem).remove();
        });

        // fix gellery image
        body.find('.batalha-imagem').map((i,elem) => {
            elem.name = 'div';
            $(elem).find('li').filter((i,li) => !$(li).children()[0]).remove();
            $(elem).find('img').map((i,img) => {
                const src = $(img).attr('src');
                const alt = $(img).attr('alt');
                fix_img_with_figure($(img).parent(), src, alt, 'replace');
            });
            $(elem).insertBefore($(elem).parent());
        });

        // download images
        body.find('img').filter((i,elem) => $(elem).attr('src')).map((i,img) => {
            const src = url.resolve(BASE_URI, $(img).attr('src'));
            const alt = $(img).attr('alt');
            const title = $(img).attr('title');
            const parent = $(img).parent();
            if (parent[0].name == 'figure') {
                const image = libingester.util.download_img(img);
                save_image_asset(image, title);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                const wrapp = find_first_wrapp(img, body.attr('id'));
                const figure = fix_img_with_figure(wrapp, src, alt, 'replace', title);
                const image = libingester.util.download_img($(figure.children()[0]));
                save_image_asset(image, title);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            }
        });

        // clean body
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

        // fix iframes
        body.find('iframe').map((i,elem) => {
            const wrapp = $(find_first_wrapp(elem, body.attr('id')));
            const src = $(elem).attr('src');
            const domain = url.parse(src).hostname;
            switch (domain) {
                case 'www.youtube.com': {
                    const video = libingester.util.get_embedded_video_asset(wrapp, src);
                    const uri_thumb = get_url_thumb_youtube(src);
                    const thumb_video = libingester.util.download_image(uri_thumb);
                    thumb_video.set_title(title);
                    video.set_title(title);
                    video.set_thumbnail(thumb_video);
                    hatch.save_asset(video);
                    break;
                }
                default: { $(elem).remove(); }
            }
        });

        // set asset thumbnail
        if (!thumbnail && url_thumb) {
            thumbnail = libingester.util.download_image(url_thumb);
            save_image_asset(thumbnail, title);
            asset.set_thumbnail(thumbnail);
        }

        // clean empty tags
        body.find('h2, p').filter((i,elem) => $(elem).text().trim() === '').remove();

        // article settings
        asset.set_author(item.author);
        asset.set_body(body);
        asset.set_canonical_uri(item.link);
        asset.set_custom_scss(CUSTOM_SCSS);
        asset.set_date_published(item.date);
        asset.set_last_modified_date(item.date);
        asset.set_read_more_text(read_more);
        asset.set_synopsis(description);
        asset.set_tags(item.categories);
        asset.set_title(title);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, item);
    });
}

function main() {
    const hatch = new libingester.Hatch('justlia', 'pt');
    const feed = libingester.util.create_wordpress_paginator(RSS_URI);
    const days_old = parseInt(process.argv[2]) || 1;

    libingester.util.fetch_rss_entries(feed, 100, days_old).then(rss => {
        return Promise.all(rss.map(item => ingest_article(hatch, item)))
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
