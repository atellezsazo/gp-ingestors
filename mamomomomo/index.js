'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');

const base_uri = 'http://www.mamomomomo.com/';
const rss_uri = 'http://www.mamomomomo.com/feed/';

// clean tags
const clean_tags = ['a', 'figure', 'p', 'span'];

// remove metadata
const remove_attr = ['height', 'rscset', 'sizes', 'style', 'width'];

// remove elements
const remove_elements = ['noscript', 'script', 'style'];

/** ingest_article
 *  @param {Object} hatch The Hatch object of the Ingester library
 *  @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const body = $('.entry-content').first();
        const categories = $('.entry-categories').first();
        const description = $('meta[property="og:description"]').attr('content');
        const modified_time = $('meta[property="article:modified_time"]').attr('content');
        const published_date = $('.entry-date').first().text();
        const section = $('meta[property="article:section"]').attr('content');
        const tags = $('.entry-tags').first();
        const title = $('meta[property="og:title"]').attr('content');
        const url_thumb = $('.wp-post-image[itemprop="image"]').first().attr('src');

        // article settings
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        asset.set_section(section);
        asset.set_synopsis(description);
        asset.set_title(title);

        // clean body
        const clean_attr = (tag, a = remove_attr) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(remove_elements.join(',')).remove();
        body.find('iframe').parent().remove();
        body.find(clean_tags.join(',')).get().map((tag) => clean_attr(tag));

        // download main image
        let main_image, set_thumbnail = true;
        if (url_thumb) {
            main_image = libingester.util.download_image(url_thumb);
            asset.set_thumbnail(main_image);
            main_image.set_title(title);
            hatch.save_asset(main_image);
            set_thumbnail = false;
        }

        // download images
        body.find('img').get().map((img) => {
            clean_attr(img);
            const image = libingester.util.download_img(img);
            hatch.save_asset(image);
            if (set_thumbnail) {
                asset.set_thumbnail(image);
                set_thumbnail = false;
            }
        });

        const content = mustache.render(template.structure_template, {
            body: body.html(),
            categories: categories.html(),
            main_image: main_image,
            published_date: published_date,
            tags: tags.html(),
            title: title,
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, (err, rss) => {
        Promise.all(
            rss.items.map((item) => ingest_article(hatch, item.url))
        ).then(() => {
            return hatch.finish();
        })
    });
}

main();