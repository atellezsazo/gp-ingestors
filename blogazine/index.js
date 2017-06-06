'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');

const RSS_URI = 'https://blogazine.pub/blog/feed';

/**
 * utilities
 *
 * A utility library
 *
 * @param {Objet} item The object with the metadata of post
 * @param {Objet} $ Instance to manipulate the DOM of the post given
 */
function utilities(item, $) {
    /** array of tags to be removed */
    const _remove_elements = [
        'iframe',
        'ins',
        'script',
        'video',
    ];

    /** array of attributes to be removed */
    const _remove_attr = [
        'alt',
        'class',
        'dir',
        'height',
        'style',
        'width',
    ];

    /** array of tags to be cleaned */
    const _clear_tags = [
        'div',
        'img',
        'ol',
        'p',
        'span',
        'strong',
        'u',
        'ul',
    ];

    /** Cleans the HTML element to return a string */
    const _cleaning_tags = (tags) => {
        return tags.map((id, tag) => {
            return $(tag).text();
        }).get().join(', ');
    };

    /** remove elements and comments */
    const _cleaning_body = (content) => {
        content.contents().filter((index, node) => node.type === 'comment').remove();
        content.find(_remove_elements.join(',')).remove();
        content.find(_clear_tags.join(',')).map((index, elem) => {
            _remove_attr.map((attr) => {
                delete elem.attribs[attr]
            })
        });
        return content;
    };

    /** Utility to truncate the text of the synopsis */
    const _truncate = (str, length) => {
        let _length = length || 150;
        let _end = '...';

        if (str.length > _length) {
            str = str.substring(0, _length - _end.length) + _end;
        }
        return str;
    };

    return {
        /** object with the processed metadata of a post  */
        post_metadata: () => {
            return {
                author: $('.node-blog .submitted a').first().text(),
                body: _cleaning_body($('.field-name-body .field-item').first()),
                cover: $('.field-name-field-blog-cover img').first(),
                date: new Date(item.created),
                synopsis: _truncate($(item.description).text()),
                tags: _cleaning_tags($('.field-type-taxonomy-term-reference a'))
            }
        },

        /** render and save the content */
        render_template: (hatch, asset, template, post_data) => {
            const content = mustache.render(template, post_data);
            asset.set_document(content);
            hatch.save_asset(asset);
        }
    }
}

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The object with the metadata of post
 */
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.url).then(($) => {
        const util = utilities(item, $);
        const asset = new libingester.NewsArticle();
        const post = util.post_metadata();

        // article settings
        asset.set_canonical_uri(item.url);
        asset.set_section(post.tags);
        asset.set_title(item.title);
        asset.set_synopsis(post.synopsis);
        asset.set_last_modified_date(post.date);

        // download cover
        if (post.cover.length > 0) {
            if (post.cover[0].attribs.src !== undefined) {
                const main_image = libingester.util.download_img(post.cover[0]);
                main_image.set_title(item.title);
                hatch.save_asset(main_image);
                post.thumbnail = main_image;
                post.main_image = main_image;
            }
        }

        // download images
        post.body.find('img').map((id, img) => {
            const image = libingester.util.download_img($(img));
            image.set_title(item.title);
            hatch.save_asset(image);
            if (id === 0) {
                post.thumbnail = image;
            }
        });

        // set thumbnail
        if (post.thumbnail) {
            asset.set_thumbnail(post.thumbnail);
        }

        util.render_template(hatch, asset, template.structure_template, {
            author: post.author,
            body: post.body.html(),
            main_image: post.main_image,
            post_tags: post.tags,
            published: post.date.toLocaleDateString(),
            title: item.title
        });
    }).catch((err) => {
        return ingest_article(hatch, item);
    });
}

/**
 * main method
 *
 * The main method to initialize the ingestion of the given site
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