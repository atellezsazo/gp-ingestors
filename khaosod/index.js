'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./template');

const BASE_URI = 'https://www.khaosod.co.th/';

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
    'height',
    'itemscope',
    'itemprop',
    'itemtype',
    'sizes',
    'style',
    'title',
    'width',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    '.td-post-featured-image',
    '.ud-video-wrapper',
    'iframe',
    'noscript',
    'script',
    'style',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('meta[name="author"]').attr('content');
        const category = $('.entry-crumbs').first();
        const body = $('.td-post-content').first();
        const description = $('meta[property="og:description"]').attr('content');
        const entry_date = $('time.entry-date').first();
        const modified_date = new Date(Date.parse(entry_date.attr('datetime'))); // for asset
        const modified_time = entry_date.text(); // for template
        const section = $('meta[property="article:section"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = body.find('.entry-thumb').first().attr('src');
        const uri_image_video = $('meta[property="og:image"]').attr('content');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(modified_date);
        asset.set_section(section);
        asset.set_synopsis(description);
        asset.set_title(title);

        // main image or video background
        const main_image = libingester.util.download_image(uri_main_image || uri_image_video);
        main_image.set_title(title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        body.find('#AdAsia').parent().remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        category.find('img, i, meta').remove();
        clean_tags(body.find(CLEAN_ELEMENTS.join(',')));
        clean_tags(category.find(CLEAN_ELEMENTS.join(',')));

        // download images
        body.find('img').get().map((img) => {
            clean_attr(img);
            const image = libingester.util.download_img(img);
            image.set_title(title);
            hatch.save_asset(image);
        });

        const content = mustache.render(template.structure_template, {
            author: author,
            body: body.html(),
            category: category.html(),
            date_published: modified_time,
            main_image: main_image,
            title: title,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    const _add_day = (date, numDays = 0) => {
        return numDays === 0 ? date : new Date(date.setDate(date.getDate() + numDays));
    };

    libingester.util.fetch_html(BASE_URI + 'home/').then(($) => {
        let links = [],
            max_category = 3,
            num = 1,
            category = '';
        const regex1 = /[\s\S]*khaosod.co.th\/([\s\S]*)\/[\s\S]*/;
        const regex2 = /([\s\S]*)\/[\s\S]*/;

        // getting all links and filtering by date (yestarday and today)
        for (const tag of $('.entry-date').get()) {
            const tag_date = new Date(Date.parse($(tag).attr('datetime')));
            const date = _add_day(new Date(), -1);
            let tag_article = $(tag);
            if (tag_date >= date) {
                for (let i = 0; i < 3; i++) tag_article = tag_article.parent();
                const uri = tag_article.find('h3 a').first().attr('href');
                if (uri.includes('khaosod.co.th') && !uri.includes('/feed/')) {
                    const new_category = uri.replace(regex1, '$1').replace(regex2, '$1');
                    if (category === '') category = new_category;
                    if (category != new_category) num = 1;
                    if (num++ <= max_category) links.push(uri);
                    category = new_category;
                }
            }
        }

        Promise.all(links.map((uri) => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();