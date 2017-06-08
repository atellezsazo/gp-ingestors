'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./template');

const BASE_URI = 'http://bk.asia-city.com/';
const RSS_URI = 'http://www.indiechine.com/?feed=rss2';

/**
 * utilities
 *
 * A utility library
 *
 * @param {Objet} $ Instance to manipulate the DOM of the post given
 * @param {Objet} item The object with the metadata of post
 */
function utilities($, item) {
    /** array of tags to be removed */
    const _remove_elements = [
        '.jp-relatedposts',
        '.ssba',
        '[data-pin-do="buttonBookmark"]',
        'iframe',
        'script',
    ];

    /** array of attributes to be removed */
    const _remove_attr = [
        'alt',
        'class',
        'data-recalc-dims',
        'dir',
        'height',
        'id',
        'rel',
        'sizes',
        'style',
        'width',
    ];

    /** array of tags to be cleaned */
    const _clean_tags = [
        'a',
        'div',
        'em',
        'figcaption',
        'figure',
        'h1, h2, h3, h4, h5, h6',
        'img',
        'ol',
        'p',
        'span',
        'strong',
        'u',
        'ul',
    ];

    /** Returns the extracted text from an array of HTML elements */
    const _extract_text = (tags) => {
        return tags.map((id, tag) => {
            return $(tag).text();
        }).get().join(', ');
    };

    /** removes the designated HTML tags from the content */
    const _sanitize_content = (content, tags) => {
        let rmtags = tags || _remove_elements;
        content.contents().filter((index, node) => node.type === 'comment').remove();
        content.find(rmtags.join(',')).remove();
        return content;
    };

    /** removes the attributes of the designated HTML tags from the content */
    const _sanitize_attr = (content) => {
        const clean_attr = (tag, a = _remove_attr) => a.forEach((attr) => $(tag).removeAttr(attr));
        content.find(_clean_tags.join(',')).get().map((tag) => clean_attr(tag));
        return content;
    }

    /** remove elements and comments */
    const _cleaning_body = (content) => {
        content = _sanitize_content(content);
        content = _sanitize_attr(content);
        return content;
    };

    return {
        /** object with the processed metadata of a post  */
        post_metadata: () => {
            let $synopsis = cheerio.load(item.description);
            $synopsis('a').remove();
            return {
                author: $('.author a').first().text(),
                body: _cleaning_body($('article .entry-content').first()),
                category: _extract_text($('.cat-links a')),
                date: new Date(Date.parse($('.published').attr('datetime'))),
                synopsis: $synopsis.text(),
                tags: _extract_text($('.tags-links a')),
                title: item.title
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
        const util = utilities($, item);
        const asset = new libingester.NewsArticle();
        const post = util.post_metadata();

        // article settings
        asset.set_canonical_uri(item.url);
        asset.set_last_modified_date(post.date);
        asset.set_section(post.tags);
        asset.set_synopsis(post.synopsis);
        asset.set_title(post.title);

        // download images
        post.body.find('img').map((id, img) => {
            if (img.attribs.src) {
                const image = libingester.util.download_img($(img), BASE_URI);
                image.set_title(post.title);
                hatch.save_asset(image);
                if (id === 0) {
                    post.cover = image;
                    asset.set_thumbnail(image);
                }
            }
        });

        util.render_template(hatch, asset, template.structure_template, {
            author: post.author,
            category: post.category,
            body: post.body.html(),
            post_tags: post.tags,
            published: post.date.toLocaleDateString(),
            title: post.title
        });
    }).catch((err) => {
        console.log(err);
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
        console.log("aca");
        Promise.all(
            rss.items.map(item => ingest_article(hatch, item))
        ).then(() => {
            return hatch.finish();
        });
    });
}

main();