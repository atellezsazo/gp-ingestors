'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const url = require('url');
const template = require('./template');

const RSS_URI = 'https://www.matichon.co.th/feed';

// Remove elements (body)
const REMOVE_ELEMENTS = [
    '.td-a-rec',
    '.td-a-rec-id-content_inline',
    '.td-post-featured-image',
    '.ud-article-info-table',
    'iframe',
    'ins',
    'script',
    'video'
];

const REMOVE_ATTR = [
    'alt',
    'border',
    'height',
    'sizes',
    'srcset',
    'style',
    'width'
];

const CLEAR_TAGS = [
    'figure',
    'figcaption',
    'img'
];

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The objec {} with metadata (uri, author, etc)
 */
function ingest_article(hatch, item) {
    const render_template = (hatch, asset, template, post_data) => {
        const content = mustache.render(template, post_data);
        asset.set_document(content);
        hatch.save_asset(asset);
    }

    return libingester.util.fetch_html(item.url).then(($) => {
        const asset = new libingester.NewsArticle();
        const post_body = $('.td-post-content').first();
        const post_category = $('.ud-post-category-title').text();
        const main_image_uri = $('meta[property="og:image"]').attr('content');
        const post_author = $('meta[name="author"]').attr('content');
        const post_synopsis = $('meta[property="og:description"]').attr('content');
        const post_tags = $('.td-tags > li > a');
        const post_date = new Date(item.created);

        // article settings
        asset.set_canonical_uri(item.url);
        asset.set_section(post_category);
        asset.set_title(item.title);
        asset.set_synopsis(post_synopsis);
        asset.set_last_modified_date(post_date);

        // main image
        const main_image = libingester.util.download_image(main_image_uri);
        main_image.set_title(item.title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);

        // download images
        post_body.find('img').get().map((img) => {
            const image = libingester.util.download_img($(img));
            image.set_title(item.title);
            img.attribs['data-libingester-asset-id'] = image.asset_id;
            hatch.save_asset(image);

        });

        // tags
        const tags = post_tags.map((id, tag) => {
            return $(tag).text()
        }).get().join(', ');

        // remove elements and comments
        post_body.contents().filter((index, node) => node.type === 'comment').remove();
        post_body.find(REMOVE_ELEMENTS.join(',')).remove();

        //clen tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        post_body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

        render_template(hatch, asset, template.structure_template, {
            author: post_author,
            body: post_body.html(),
            category: post_category,
            main_image: main_image,
            published: post_date.toLocaleDateString(),
            post_tags: tags,
            title: item.title
        });
    }).catch((err) => {
        return ingest_article(hatch, item);
    });
}

/**
 *
 * @return {Promise}
 */
function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(RSS_URI, (err, rss) => {
        const batch_items = rss.items.map(data => data);
        Promise.all(batch_items.map(item => ingest_article(hatch, item))).then(() => {
            return hatch.finish();
        });
    });
}

main();