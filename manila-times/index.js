'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_FEED = 'http://www.manilatimes.net/feed/';

// cleaning elements
const CLEAN_ELEMENTS = [
    'a',
    'div',
    'figure',
    'i',
    'p',
    'span',
];

// delete attr (tag)
const REMOVE_ATTR = [
    'class',
    'height',
    'sizes',
    'style',
    'title',
    'width',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    '.article-embedded_video',
    '.article_header',
    '.article_social',
    '.btn',
    '.container-fluid',
    '.embedded-twitter',
    '.promoLibrary',
    'iframe',
    'noscript',
    'script',
    'style',
];



function ingest_article(hatch, item, global_thumbnail) {
    return libingester.util.fetch_html(item.link).then($ => {
        const asset = new libingester.NewsArticle();
        const author = $('span[itemprop="author"] a').first().text() || item.title;
        const body = $('div[itemprop="articleBody"]').first().attr('id', 'mybody');
        const copyright = $('.lower-foot .textwidget').last().text() || '';
        const modified_date = new Date(Date.parse(item.date));
        const read_more_link = `Original Article at <a href="${item.link}">www.manilatimes.net</a>`;
        const section = item.categories.join(', ');
        const synopsis = $('meta[property="og:description"]').attr('content') || '';
        const title = item.title;
        const uri_thumb = $('meta[property="og:image"]').attr('content');
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
            return undefined;
        }

        // fix the image, add figure and figcaption
        const fix_img_with_figure = (replace, src, alt = '') => {
            if (src && replace) {
                let figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                let caption = $(replace).find('.wp-caption-text').first().text();
                if (caption) {
                    figure.append(`<figcaption><p>${caption}</p></figcaption>`);
                }
                $(replace).replaceWith(figure);
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // fixed images with figcaption
        body.find('.wp-caption').map((i,embed) => {
            const fig = $(embed).find('img').first();
            const lazy_uri = fig.attr('data-lazy-src');
            const width = fig.attr('width');
            const height = fig.attr('height');
            const src = lazy_uri.replace('-'+width+'x'+height, '');
            const alt = fig.attr('alt');
            fix_img_with_figure(embed, src, alt);
        });

        // remove elements
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.contents().filter((index, node) => node.type === 'comment').remove();

        // download images
        body.find('img').map((i,img) => {
            const src = img.attribs['data-lazy-src'];
            let figure = $(img).parent();
            if (figure[0].name != 'figure') {// console.log('no figure');
                const wrapp = find_first_wrapp(img, body.attr('id'));
                figure = fix_img_with_figure(wrapp, src);
            }
            const image = libingester.util.download_img($(figure.children()[0]));
            image.set_title(title);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
        });

        // remove empty tags and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();
        clean_tags(body.find(CLEAN_ELEMENTS.join(',')));

        // thumbnail (if the article does not contain any image)
        if (!thumbnail && global_thumbnail) { // main image link
            asset.set_thumbnail(global_thumbnail);
        }

        // set lede
        let lede;
        for (const content of body.contents().get()) {
            if (content.name == 'p') {
                lede = $(content).clone();
                $(content).remove();
                break;
            }
        }

        // if the article no contain any p
        if (!lede ) lede = $(`<p>${synopsis}</p>`);

        asset.set_custom_scss(`
            $primary-light-color: #707980;
            $primary-medium-color: #292525;
            $primary-dark-color: #17232E;
            $accent-light-color: #CAA535;
            $accent-dark-color: #AC8B29;
            $background-light-color: #E8E8E8;
            $background-dark-color: #9A9393;
            $title-font: 'Playfair Display';
            $body-font: 'Merriweather';
            $display-font: 'Playfair Display';
            $context-font: 'FreeSans';
            $support-font: 'Roboto';
            h1, h2, h3 {font-weight:400;}
            @import "_default";
        `);

        // article settings
        asset.set_authors(author);
        asset.set_body(body);
        asset.set_canonical_uri(item.link);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_lede(lede);
        asset.set_license(copyright);
        asset.set_section(section);
        asset.set_synopsis(synopsis);
        asset.set_title(item.title);
        asset.set_read_more_link(read_more_link);
        asset.render();
        hatch.save_asset(asset);
    })
    .catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, item, global_thumbnail);
    });
}

function main() {
    const hatch = new libingester.Hatch('manila-times', 'en');
    const feed = libingester.util.create_wordpress_paginator(RSS_FEED);

    // Many items have no pictures and its main image is the same...
    // Downloaded once and reused
    const uri_logo = 'http://manilatimes.net/wp-content/uploads/2016/08/MNL-Times_250-x-250-logo.jpg';
    const thumbnail = libingester.util.download_image(uri_logo);
    thumbnail.set_title('The Manila Times');
    hatch.save_asset(thumbnail);

    // ingest articles
    libingester.util.fetch_rss_entries(feed).then(items => {
        return Promise.all(items.map(item => ingest_article(hatch, item, thumbnail)))
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
